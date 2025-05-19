# References:
# https://github.com/rdegges/python-basicauth/blob/main/basicauth.py
# https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html
# https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html

# Here is some magic undocumented stuff when integrating this in with an AWS REST API Gateway:
# 1. `Exception('Unauthorized')` (exactly) will result in an "HTTP 401" response code. I use a "Gateway responses"
#     override within API gateway to return a response header `WWW-Authenticate:Basic` in order for web browsers
#     to show the username and password dialog box.
# 2. `generate_policy(username, 'Deny', resource)` will result in an "HTTP 403" response code.
# 3. `generate_policy(username, 'Allow', resource)` will result in an "HTTP 200" response code.
# 4. The `resource` value in the policies needs to be scoped to the base URL, because the authorization is cached for
#    a bit. If we set the `resource` value to the `event['methodArn']` directly, we will be authorized to that specific
#    path and nothing else, until the authorization expires.


import boto3
import datetime
import dataclasses
import hashlib
import json
import logging
import typing

from base64 import b64decode
from urllib.parse import unquote

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

SSM_CLIENT = boto3.client('ssm')


@dataclasses.dataclass
class CacheEntry:
    expiration: str  # The parameter store's expiration date in UTC ISO format
    value: str  # The value from parameter store, which is a hashed password


# We store parameter information in the Lambda cache, so while the Lambda is still hot we can use it instead of
# incurring multiple request costs to parameter store.
CACHE: typing.Mapping[str, CacheEntry] = dict()


def decode(encoded):
    """Decode an encoded HTTP basic authentication string. Returns a tuple of
    the form (username, password), and raises an Exception('Unauthorized') if
    nothing could be decoded.
    """
    split = encoded.strip().split(' ')

    # If split is only one element, try to decode the username and password
    # directly.
    if len(split) == 1:
        try:
            username, password = b64decode(split[0]).decode().split(':', 1)
        except:
            raise Exception('Unauthorized')

    # If there are only two elements, check the first and ensure it says
    # 'basic' so that we know we're about to decode the right thing. If not,
    # bail out.
    elif len(split) == 2:
        if split[0].strip().lower() == 'basic':
            try:
                username, password = b64decode(split[1]).decode().split(':', 1)
            except:
                raise Exception('Unauthorized')
        else:
            raise Exception('Unauthorized')

    # If there are more than 2 elements, something crazy must be happening.
    # Bail.
    else:
        raise Exception('Unauthorized')

    return unquote(username), unquote(password)


def generate_policy(principalId, effect, resource):

    logger.info(f'{principalId} = {effect}')

    return {
        'principalId': principalId,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': resource,
                }
            ]
        }
    }


def get_parameter_value(username: str):

    # The name of the parameter is a modified email address. The username should be an email address.
    key = '/stac-server-ephemeral-credentials/' + username.replace('@', '_AT_')

    # If the user exists in cache, check the current UTC ISO time against the expiration value.
    # If we are not expired, return the value from cache.
    currentTime: datetime.datetime = datetime.datetime.now(datetime.UTC)
    if key in CACHE and currentTime < CACHE[key].expiration:
        delta = str(CACHE[key].expiration - currentTime)
        logger.info(f'Value for {key} expires in {delta}')
        return CACHE[key].value

    # Just for good hygene, if the key is in the cache, but is expired, let's remove it
    CACHE.pop(key, None)

    # Otherwise, get the expiration time and value from SSM, store it in cache, and return the value

    # First, get the expiration timestamp of the parameter so we can cache it locally
    parameters = SSM_CLIENT.describe_parameters(
        ParameterFilters=[{
            'Key': 'Name',
            'Option': 'Equals',
            'Values': [key]}],
    )

    # If the key does not exist, the returned list will have a zero length
    if len(parameters['Parameters']) == 0:
        logger.info(f'{key} does not exist')
        return None

    # The parameter exists, yay! Let's grab the expiration time for the cache
    policy: dict = json.loads(parameters['Parameters'][0]['Policies'][0]['PolicyText'])
    expiration: datetime.datetime = datetime.datetime.fromisoformat(policy['Attributes']['Timestamp'])

    # Grab the value of the parameter, which, unfortunataly, is another call. Good thing 10k calls are only $0.05.
    value = SSM_CLIENT.get_parameter(Name=key)['Parameter']['Value']

    # Store in cache
    CACHE[key] = CacheEntry(expiration=expiration, value=value)

    # Return the good hashed value
    return value


def lambda_handler(event: dict, _: dict = {}) -> dict:
    logger.info(json.dumps(event))

    # Grab the Authorization header from the request
    authorization = event.get('headers', dict()).get('Authorization')
    if authorization is None:
        raise Exception('Unauthorized')

    # Decode the Authorization header
    username, password = decode(authorization)

    # I need the auth to work on a wildcard resource
    firstPart = event['methodArn'].split('/')[0]
    stageName = event['requestContext']['stage']
    resource = f'{firstPart}/{stageName}/*'

    # Terrible temporary hardcoded username and password check.
    # TODO: Remove this once I figure out a better method for Eon at RIT.
    if username in {
        'amckenery',
        'ccamacho',
        'cfamiglietti',
        'dgleason',
        'imcgreer',
        'mweisman',
        'ssoenen',
        'snissim',
        'tkleynhans',
        'wthomas',
        'eoncis@rit.edu',
    } and password == 'ilovehydrosat':
        return generate_policy(username, 'Allow', resource)

    # If the `None` returned, the user doesn't exist or needs to re-authenticate
    storedHash = get_parameter_value(username)
    if storedHash is None:
        return generate_policy(username, 'Deny', resource)

    # Hash the entered password and compare it against the stored hash
    inputHash = hashlib.sha256(password.encode()).hexdigest()
    if inputHash != storedHash:
        logger.info(f'Incorrect password for {username}: input hash = `{inputHash}`, stored hash = `{storedHash}`')
        return generate_policy(username, 'Deny', resource)

    # If we made it this long we are OK.
    return generate_policy(username, 'Allow', resource)
