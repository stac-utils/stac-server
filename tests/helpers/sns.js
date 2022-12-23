const awsClients = require('../../src/lib/aws-clients')
const { randomId } = require('./utils')

/**
 * @returns {Promise<string>} topic ARN
 */
const createTopic = async () => {
  const sns = awsClients.sns()

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
const addSnsToSqsSubscription = async (topicArn, queueArn) => {
  await awsClients.sns().subscribe({
    TopicArn: topicArn,
    Protocol: 'sqs',
    Endpoint: queueArn
  }).promise()
}

module.exports = {
  addSnsToSqsSubscription,
  createTopic
}
