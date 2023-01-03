import { promisify } from 'util'
import cryptoRandomString from 'crypto-random-string'
import { readFile as _readFile } from 'fs'
import { join } from 'path'

export const noop = () => { }

export const nullLogger = {
  debug: noop,
  info: noop,
  log: noop
}

const readFile = promisify(_readFile)

const fixturesPath = join(__dirname, '..', 'fixtures')

export const randomId = (prefix) => {
  const randomString = cryptoRandomString({ length: 6 })

  return prefix ? `${prefix}-${randomString}` : randomString
}

const readFixture = (filename) => {
  const fixturePath = join(fixturesPath, filename)
  return readFile(fixturePath, 'utf8')
}

export const loadFixture = async (filename, overrides = {}) => {
  const content = await readFixture(filename)
  const fixture = JSON.parse(content)
  return { ...fixture, ...overrides }
}
