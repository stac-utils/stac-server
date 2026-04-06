import { PublishCommand } from '@aws-sdk/client-sns'
import { ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import type { ExecutionContext } from 'ava'
import { sns, sqs } from '../../src/lib/aws-clients.js'
import { handler } from '../../src/lambdas/ingest/index.js'
import { sqsTriggerLambda } from './sqs.js'
import { refreshIndices } from './database.js'
import { loadFixture } from './utils.js'

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

  const message = Messages && Messages.length > 0 ? Messages[0] : undefined
  const messageBody = message && message.Body ? JSON.parse(message.Body) as Record<string, unknown> : undefined

  return {
    message: messageBody && messageBody['Message'] ? JSON.parse(messageBody['Message'] as string) : undefined,
    attrs: messageBody ? messageBody['MessageAttributes'] : undefined
  }
}
