// @ts-check

const fs = require('fs')
const yaml = require('js-yaml')
const { promisify } = require('util')

const readFile = promisify(fs.readFile)

/**
 * @param {string} filename
 * @returns {Promise<unknown>}
 */
const readJson = (filename) => readFile(filename, 'utf8').then(JSON.parse)

/**
 * @param {string} filename
 * @returns {Promise<unknown>}
 */
const readYaml = (filename) => readFile(filename, 'utf8').then(yaml.safeLoad)

module.exports = {
  readFile,
  readJson,
  readYaml
}
