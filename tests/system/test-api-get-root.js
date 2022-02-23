// @ts-check

const { default: anyTest } = require('ava')
const { apiClient } = require('../helpers/api-client')
const { deleteAllIndices } = require('../helpers/es')
const systemTests = require('../helpers/system-tests')

/**
 * @template T
 * @typedef {import('ava').TestFn<T>} TestFn<T>
 */

/**
 * @typedef {import('../helpers/types').SystemTestContext} SystemTestContext
 */

const test = /** @type {TestFn<SystemTestContext>} */ (anyTest)

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context.ingestQueueUrl = standUpResult.ingestQueueUrl
  t.context.ingestTopicArn = standUpResult.ingestTopicArn
})

test('/', async (t) => {
  const response = await apiClient.get('')
  t.true(Array.isArray(response.links))
})
