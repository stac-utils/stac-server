import { PublishCommand } from '@aws-sdk/client-sns'
import { ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import type { ExecutionContext } from 'ava'
import { sns, sqs } from '../../src/lib/aws-clients.js'
import { handler } from '../../src/lambdas/ingest/index.js'
import { sqsTriggerLambda } from './sqs.js'
import { refreshIndices } from './database.js'
import { loadFixture } from './utils.js'

import type { StacRecord, Link } from '../../src/lib/types.js'

interface IngestItemParams {
  ingestTopicArn: string
  ingestQueueUrl: string
  item: unknown
}

interface IngestFixtureParams {
  ingestTopicArn: string
  ingestQueueUrl: string
  filename: string
  overrides?: Record<string, unknown>
}

interface TestContext {
  postIngestTopicArn: string
  ingestTopicArn: string
  ingestQueueUrl: string
  postIngestQueueUrl: string
}

interface SnsMessageAttribute {
  Value: string
}

export interface PostIngestMessage {
  record: StacRecord & {
    links: Link[]
    properties: Record<string, unknown>
    assets: Record<string, { href: string; alternate?: Record<string, { href: string }> }>
    stac_extensions: string[]
  }
}

export interface PostIngestAttributes {
  collection: SnsMessageAttribute
  ingestStatus: SnsMessageAttribute
  recordType: SnsMessageAttribute
  datetime?: SnsMessageAttribute
  start_datetime?: SnsMessageAttribute
  end_datetime?: SnsMessageAttribute
  start_unix_epoch_ms_offset?: SnsMessageAttribute
  end_unix_epoch_ms_offset?: SnsMessageAttribute
  'bbox.sw_lon': SnsMessageAttribute
  'bbox.sw_lat': SnsMessageAttribute
  'bbox.ne_lon': SnsMessageAttribute
  'bbox.ne_lat': SnsMessageAttribute
  [key: string]: SnsMessageAttribute | undefined
}

export const ingestItem = async (params: IngestItemParams): Promise<void> => {
  const command = new PublishCommand({
    TopicArn: params.ingestTopicArn,
    Message: JSON.stringify(params.item)
  })
  await sns().send(command)

  await sqsTriggerLambda(params.ingestQueueUrl, handler)

  await refreshIndices()
}

export const ingestItemC = (ingestTopicArn: string, ingestQueueUrl: string) =>
  (item: unknown): Promise<void> =>
    ingestItem({ ingestQueueUrl, ingestTopicArn, item })

export const ingestFixture = async ({
  ingestTopicArn,
  ingestQueueUrl,
  filename,
  overrides = {}
}: IngestFixtureParams): Promise<Record<string, unknown>> => {
  const msg = await loadFixture(filename, overrides)

  await ingestItem({
    ingestTopicArn,
    ingestQueueUrl,
    item: msg
  })

  return msg
}

export const ingestFixtureC = (ingestTopicArn: string, ingestQueueUrl: string) =>
  (filename: string, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    ingestFixture({
      ingestQueueUrl,
      ingestTopicArn,
      filename,
      overrides
    })

export async function testPostIngestSNS(
  t: ExecutionContext<TestContext>,
  record: unknown,
  shouldError = false
) {
  process.env['POST_INGEST_TOPIC_ARN'] = t.context.postIngestTopicArn

  const publishCommand = new PublishCommand({
    TopicArn: t.context.ingestTopicArn,
    Message: JSON.stringify(record)
  })
  await sns().send(publishCommand)

  try {
    await sqsTriggerLambda(t.context.ingestQueueUrl, handler)
  } catch (_) {
    if (!shouldError) {
      t.fail('Ingest had error, but should not have.')
    }
  }

  const receiveCommand = new ReceiveMessageCommand({
    QueueUrl: t.context.postIngestQueueUrl,
    WaitTimeSeconds: 1
  })
  const { Messages } = await sqs().send(receiveCommand)

  t.truthy(Messages, 'Post-ingest message not found in queue')
  t.false(Messages && Messages.length > 1, 'More than one message in post-ingest queue')

  const firstMessage = Messages![0]
  t.truthy(firstMessage?.Body, 'Post-ingest message has no body')

  const messageBody = JSON.parse(firstMessage!.Body!) as Record<string, unknown>

  const message = messageBody['Message']
    ? JSON.parse(messageBody['Message'] as string) as PostIngestMessage
    : undefined

  const attrs = messageBody['MessageAttributes'] as PostIngestAttributes | undefined

  return { message: message!, attrs: attrs! }
}
