import winston from 'winston'
import { app } from './app'

const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'warn',
  transports: [new winston.transports.Console()],
})

const port = 3000

app.listen(port, () => {
  logger.warn(`stac-server listening on port ${port}`)
})
