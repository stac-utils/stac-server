/* eslint-disable import/prefer-default-export */
import { readFile as _readFile } from 'fs'
import { promisify } from 'util'

export const readFile = promisify(_readFile)
