#!/usr/bin/env node
/*
|--------------------------------------------------------------------------
| Docteur CLI
|--------------------------------------------------------------------------
|
| Standalone CLI for profiling AdonisJS cold start performance.
| Can be installed globally and run in any AdonisJS project.
|
*/

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCommand, runMain } from 'citty'
import { diagnoseCommand } from './commands/diagnose.js'
import { xrayCommand } from './commands/xray.js'

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../../package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

const main = defineCommand({
  meta: {
    name: 'docteur',
    version: pkg.version,
    description: pkg.description,
  },
  subCommands: {
    diagnose: diagnoseCommand,
    xray: xrayCommand,
  },
})

runMain(main)
