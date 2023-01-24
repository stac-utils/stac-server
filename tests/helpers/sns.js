import { sns as _sns } from '../../src/lib/aws-clients.js'
import { randomId } from './utils.js'

/**
 * @returns {Promise<string>} topic ARN
 */
export const createTopic = async () => {
  const sns = _sns()

  const { TopicArn } = await sns.createTopic({
    Name: randomId('topic')
  }).promise()

  if (TopicArn) return TopicArn

  throw new Error('Unable to create topic')
}

/**
 * @param {string} topicArn
 * @param {string} queueArn
 * @returns {Promise<void>}
 */
export const addSnsToSqsSubscription = async (topicArn, queueArn) => {
  await _sns().subscribe({
    TopicArn: topicArn,
    Protocol: 'sqs',
    Endpoint: queueArn
  }).promise()
}
