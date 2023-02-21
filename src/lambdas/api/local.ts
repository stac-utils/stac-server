import winston from 'winston'
import { app } from './app.js'

const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'warn',
  format: winston.format.combine(
    winston.format.splat(), winston.format.errors({ stack: true }), winston.format.json()
  ),
  transports: [new winston.transports.Console()],
})

const port = 3000

app.listen(port, () => {
  logger.warn(`stac-server listening on port ${port}`)
})
