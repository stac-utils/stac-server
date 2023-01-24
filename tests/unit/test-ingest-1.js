import test from 'ava'
import { stub } from 'sinon'
import proxyquire from 'proxyquire'
import createEvent from 'aws-event-mocks'

const setup = () => {
  const ingest = stub().resolves(true)
  const ingestItem = stub().resolves(true)
  const opensearch = 'opensearch'
  const ECS = stub()
  const runTask = stub().resolves(true).returns({
    promise: () => (Promise.resolve(true))
  })
  ECS.prototype.runTask = runTask
  const AWS = {
    ECS
  }
  const lambda = proxyquire('../../src/lambdas/ingest/', {
    'aws-sdk': AWS
  })
  return {
    ingest,
    ingestItem,
    opensearch,
    lambda,
    runTask
  }
}

test.skip('handler uses non-recursive ingest for S3 SNS Event', async (t) => {
  const { ingest, lambda, opensearch } = setup()
  const bucket = 'bucket'
  const key = 'key'
  const s3Event = createEvent({
    template: 'aws:s3',
    merge: {
      Records: [{
        eventName: 'ObjectCreated:Put',
        s3: {
          bucket: {
            name: bucket
          },
          object: {
            key: key
          }
        }
      }]
    }
  })
  const message = JSON.stringify(s3Event)

  const snsEvent = createEvent({
    template: 'aws:sns',
    merge: {
      Records: [{
        Sns: {
          Message: message
        }
      }]
    }
  })
  await lambda.handler(snsEvent)
  const expectedUrl = `https://${bucket}.s3.amazonaws.com/${key}`
  const expectedRecursive = false
  t.is(ingest.firstCall.args[0], expectedUrl, 'S3 Url is parsed correctly')
  t.is(ingest.firstCall.args[1], opensearch, 'Search library passed as parameter')
  t.is(ingest.firstCall.args[2], expectedRecursive, 'Recursive is false')
})

test.skip('handler calls ingestItem when event payload is a feature', async (t) => {
  const { ingestItem, lambda, opensearch } = setup()
  const event = {
    type: 'Feature'
  }
  await lambda.handler(event)
  t.deepEqual(ingestItem.firstCall.args[0], event, 'Calls ingestItem with event')
  t.is(ingestItem.firstCall.args[1], opensearch, 'Search library passed as a parameter')
})

test.skip('handler call ingest when event payload contains url', async (t) => {
  const { ingest, lambda, opensearch } = setup()
  const url = 'url'
  const recursive = false
  const collectionsOnly = true
  const event = {
    url,
    recursive,
    collectionsOnly
  }
  await lambda.handler(event)
  t.truthy(
    ingest.calledOnceWith(url, opensearch, recursive, collectionsOnly),
    'Calls ingest with url and correct parameters.'
  )
})

test.skip('ingest with fargate event creates ecs task with command', async (t) => {
  process.env['SUBNETS'] = '{}'
  process.env['SECURITY_GROUPS'] = '{}'
  const { lambda, runTask } = setup()
  const event = {
    fargate: {
      url: 'url'
    }
  }
  await lambda.handler(event)
  const params = runTask.firstCall.args[0]
  const command = params.overrides.containerOverrides[0].command
  t.is(command[2], JSON.stringify(event.fargate))
})
