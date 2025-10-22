import { CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns'
import { sns as _sns } from '../../src/lib/aws-clients.js'
import { randomId } from './utils.js'

/**
 * @returns {Promise<string>} topic ARN
 */
export const createTopic = async () => {
  const sns = _sns()

  const command = new CreateTopicCommand({
    Name: randomId('topic')
  })
  const { TopicArn } = await sns.send(command)

  if (TopicArn) return TopicArn

  throw new Error('Unable to create topic')
}

/**
 * @param {string} topicArn
 * @param {string} queueArn
 * @returns {Promise<void>}
 */
export const addSnsToSqsSubscription = async (topicArn, queueArn) => {
  const command = new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: 'sqs',
    Endpoint: queueArn
  })
  await _sns().send(command)
}
