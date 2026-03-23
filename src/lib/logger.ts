import winston from 'winston'

export default winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'warn',
  format: winston.format.combine(
    winston.format.splat(), winston.format.errors({ stack: true }), winston.format.json()
  ),
  transports: [new winston.transports.Console()],
})
