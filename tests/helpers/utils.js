/* eslint @typescript-eslint/no-empty-function: 0 */

const { promisify } = require('util')
const cryptoRandomString = require('crypto-random-string')
const fs = require('fs')
const path = require('path')

const readFile = promisify(fs.readFile)

const fixturesPath = path.join(__dirname, '..', 'fixtures')

const randomId = (prefix) => {
  const randomString = cryptoRandomString({ length: 6 })

  return prefix ? `${prefix}-${randomString}` : randomString
}

const readFixture = (filename) => {
  const fixturePath = path.join(fixturesPath, filename)
  return readFile(fixturePath, 'utf8')
}

const loadFixture = async (filename, overrides = {}) => {
  const content = await readFixture(filename)
  const fixture = JSON.parse(content)
  return { ...fixture, ...overrides }
}

module.exports = {
  loadFixture,
  randomId
}
