import { APIGatewayProxyEvent } from 'aws-lambda'

// extending the main 'express' 'Request' type to add 'endpoint'
// that is not on the default type
declare global {
  namespace Express {
    interface Request {
      endpoint: string
      event?: APIGatewayProxyEvent
    }
  }
}
