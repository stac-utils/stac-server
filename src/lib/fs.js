import { readFile as _readFile } from 'fs'
import { promisify } from 'util'

export const readFile = promisify(_readFile)

/**
 * @param {string} filename
 * @returns {Promise<unknown>}
 */
export const readJson = (filename) => readFile(filename, 'utf8').then(JSON.parse)
