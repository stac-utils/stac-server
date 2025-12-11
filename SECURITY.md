# Security Policy

**Documentation:** [README](README.md) | [Architecture](ARCHITECTURE.md) | [Configuration](CONFIGURATION.md) | [Deployment](DEPLOYMENT.md) | [Contributing](CONTRIBUTING.md) | [Security](SECURITY.md) | [Changelog](CHANGELOG.md)

## Supported Versions

Security fixes are provided on a best-effort basis for the current major version. We strongly recommend keeping stac-server updated to the latest release to ensure you have the most recent security patches.

## Reporting a Vulnerability

The stac-server team takes security bugs seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report a Security Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities using [GitHub's private vulnerability reporting feature](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

To report a vulnerability, go to the [Security Advisories](https://github.com/stac-utils/stac-server/security/advisories/new) page and create a new security advisory.

### What to Include

Please include the following information to help us better understand the nature and scope of the possible issue:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Disclosure Policy

- Please give us reasonable time to investigate and address the vulnerability before any public disclosure
- We will credit you in the security advisory when we publish the fix (unless you prefer to remain anonymous)
- Once the vulnerability is fixed, we will publish a security advisory on GitHub

## Security Best Practices

### OpenSearch Security

When deploying stac-server, follow these OpenSearch security best practices:

1. **Enable Fine-grained Access Control**: Use OpenSearch's built-in fine-grained access control for granular permissions (see [DEPLOYMENT.md](DEPLOYMENT.md))

2. **Use Strong Passwords**: If using fine-grained access control, ensure master and service account passwords are strong and unique

3. **Secrets Management**: Store credentials in AWS Secrets Manager rather than environment variables when possible

4. **Network Security**:
   - Deploy OpenSearch in a VPC
   - Use security groups to restrict access
   - Consider VPC endpoints for AWS services

5. **Enable Encryption**:
   - Enable encryption at rest for OpenSearch domains
   - Enable node-to-node encryption
   - Use HTTPS/TLS for all connections

6. **Regular Updates**: Keep OpenSearch and stac-server updated to the latest supported versions

### AWS Lambda Security

1. **Principle of Least Privilege**: Grant Lambda functions only the IAM permissions they need

2. **Environment Variables**: Use encryption for sensitive environment variables

3. **VPC Configuration**: Deploy Lambdas in a VPC when accessing resources that require it

4. **Monitoring**: Enable CloudWatch logging and set up alerts for suspicious activity

### API Gateway Security

1. **Authentication**: Consider implementing authentication for transaction endpoints (see [DEPLOYMENT.md](DEPLOYMENT.md) for IP-based restrictions)

2. **Rate Limiting**: Configure API Gateway throttling to prevent abuse

3. **WAF**: Use AWS WAF to protect against common web exploits (note the SQL injection false positive in [DEPLOYMENT.md](DEPLOYMENT.md))

4. **CORS**: Configure CORS appropriately for your use case

## Keeping Up to Date

- Watch this repository for security advisories
- Subscribe to security notifications via GitHub
- Check the [CHANGELOG](CHANGELOG.md) for security-related updates
- Join community discussions about security issues

## Additional Resources

- [OpenSearch Security Documentation](https://opensearch.org/docs/latest/security/)
- [AWS Security Best Practices](https://docs.aws.amazon.com/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

Thank you for helping keep stac-server and its users safe!
