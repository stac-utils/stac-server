// @ts-check

const fs = require('fs')
const { promisify } = require('util')

const readFile = promisify(fs.readFile)

/**
 * @param {string} filename
 * @returns {Promise<unknown>}
 */
const readJson = (filename) => readFile(filename, 'utf8').then(JSON.parse)

module.exports = {
  readFile,
  readJson
}
