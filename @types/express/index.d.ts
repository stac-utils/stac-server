/// <reference types="aws-lambda" />

declare namespace Express {
  interface Request {
    endpoint?: string
    event?: AWSLambda.APIGatewayProxyEvent
  }
}
