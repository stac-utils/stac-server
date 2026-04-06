import { promisify } from 'util'
import cryptoRandomString from 'crypto-random-string'
import { readFile as _readFile } from 'fs'
import path, { join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const readFile = promisify(_readFile)

const fixturesPath = join(__dirname, '..', 'fixtures')

export const randomId = (prefix?: string): string => {
  const randomString = cryptoRandomString({ length: 6 })

  return prefix ? `${prefix}-${randomString}` : randomString
}

const readFixture = (filename: string): Promise<string> => {
  const fixturePath = join(fixturesPath, filename)
  return readFile(fixturePath, 'utf8')
}

export const loadFixture = async (
  filename: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> => {
  const content = await readFixture(filename)
  const fixture = JSON.parse(content) as Record<string, unknown>
  return { ...fixture, ...overrides }
}
