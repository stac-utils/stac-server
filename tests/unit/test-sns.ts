import test from 'ava'
import { mockClient } from 'aws-sdk-client-mock'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { publishRecordToSns } from '../../src/lib/sns.js'
import type { StacItem } from '../../src/lib/types.js'

const snsMock = mockClient(SNSClient)

const item = {
  type: 'Feature',
  id: 'test',
  collection: 'test',
  properties: {
    datetime: '1955-11-05T13:00:00Z'
  }
} as StacItem

const topicArn = 'arn:aws:sns:us-east-1:123456789012:post-ingest'

test.beforeEach(() => {
  snsMock.reset()
})

// Read the ingestStatus attribute off the PublishCommand the SNS client received.
const publishedIngestStatus = () => {
  const call = snsMock.commandCalls(PublishCommand)[0]
  return call?.args[0].input.MessageAttributes?.['ingestStatus']?.StringValue
}

// Serial because these share the module-level SNS mock and assert on its
// captured calls; running them concurrently would interleave the captures.
test.serial('publishes ingestStatus "successful" when there is no error', async (t) => {
  await publishRecordToSns(topicArn, item, undefined)
  t.is(publishedIngestStatus(), 'successful')
})

test.serial('publishes ingestStatus "failed" when there is an error message', async (t) => {
  await publishRecordToSns(topicArn, item, 'something went wrong')
  t.is(publishedIngestStatus(), 'failed')
})

test.serial('publishes ingestStatus "failed" when the error message is empty', async (t) => {
  // An ingest error with an empty message is still a failure; the status must
  // not be derived from the truthiness of the message string.
  await publishRecordToSns(topicArn, item, '')
  t.is(publishedIngestStatus(), 'failed')
})
