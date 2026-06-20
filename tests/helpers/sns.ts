import { CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns'
import { sns as _sns } from '../../src/lib/aws-clients.js'
import { randomId } from './utils.js'

export const createTopic = async (): Promise<string> => {
  const sns = _sns()

  const command = new CreateTopicCommand({
    Name: randomId('topic')
  })
  const { TopicArn } = await sns.send(command)

  if (TopicArn) return TopicArn

  throw new Error('Unable to create topic')
}

export const addSnsToSqsSubscription = async (
  topicArn: string,
  queueArn: string
): Promise<void> => {
  const command = new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: 'sqs',
    Endpoint: queueArn
  })
  await _sns().send(command)
}
