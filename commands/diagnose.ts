/*
|--------------------------------------------------------------------------
| Docteur Analyze Command
|--------------------------------------------------------------------------
|
| Ace command that profiles the AdonisJS application's cold start time.
|
*/

import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { ModuleTiming, ProfileResult, ProviderTiming, ResolvedConfig } from '../src/types.js'
import { collectResults } from '../src/profiler/collector.js'
import { printReport } from '../src/profiler/reporter.js'

/**
 * Returns metadata for all commands exported by this module
 */
export function getMetaData() {
  return [Diagnose.serialize()]
}

/**
 * Returns the command class for a given command name
 */
export async function getCommand(_name: string) {
  return Diagnose
}

export default class Diagnose extends BaseCommand {
  static commandName = 'docteur:diagnose'
  static description = 'Analyze cold start performance'

  static options: CommandOptions = {
    startApp: false,
    staysAlive: false,
  }

  @flags.number({
    description: 'Number of slowest modules to display',
    default: 20,
  })
  declare top: number

  @flags.number({
    description: 'Only show modules slower than this threshold (in ms)',
    default: 1,
  })
  declare threshold: number

  @flags.boolean({
    description: 'Include node_modules in the analysis',
    default: true,
  })
  declare nodeModules: boolean

  @flags.boolean({
    description: 'Group modules by package name',
    default: true,
  })
  declare group: boolean

  @flags.string({
    description: 'Entry point to profile (defaults to bin/server.ts)',
  })
  declare entry: string

  async run() {
    const cwd = this.app.appRoot.pathname

    // Find the loader module path
    const loaderPath = this.#findLoaderPath()
    if (!loaderPath) {
      this.logger.error('Could not find docteur loader module')
      return (this.exitCode = 1)
    }

    // Find the entry point
    const entryPoint = this.#findEntryPoint(cwd)
    if (!entryPoint) {
      this.logger.error('Could not find entry point. Use --entry to specify one.')
      return (this.exitCode = 1)
    }

    this.logger.info('Starting cold start analysis...')
    this.logger.info(`Entry point: ${entryPoint}`)
    console.log()

    try {
      const result = await this.#profileApp(loaderPath, entryPoint, cwd)
      const config = this.#buildConfig()
      printReport(result, config, cwd)
    } catch (error) {
      this.logger.error('Profiling failed')
      if (error instanceof Error) {
        this.logger.error(error.message)
      }
      return (this.exitCode = 1)
    }
  }

  /**
   * Finds the loader module path
   */
  #findLoaderPath(): string | null {
    // Try to find the loader relative to this module
    const currentDir = dirname(fileURLToPath(import.meta.url))

    // In development (source)
    const devPath = join(currentDir, '..', 'src', 'profiler', 'loader.js')
    if (existsSync(devPath)) {
      return devPath
    }

    // In production (build)
    const buildPath = join(currentDir, '..', 'build', 'src', 'profiler', 'loader.js')
    if (existsSync(buildPath)) {
      return buildPath
    }

    // Try node_modules path
    try {
      const modulePath = import.meta.resolve('docteur/profiler/loader')
      return fileURLToPath(modulePath)
    } catch {
      return null
    }
  }

  /**
   * Finds the entry point to profile
   */
  #findEntryPoint(cwd: string): string | null {
    if (this.entry) {
      const customPath = resolve(cwd, this.entry)
      if (existsSync(customPath)) {
        return customPath
      }
      return null
    }

    // Try common entry points
    const candidates = ['bin/server.ts', 'bin/server.js', 'server.ts', 'server.js']

    for (const candidate of candidates) {
      const fullPath = join(cwd, candidate)
      if (existsSync(fullPath)) {
        return fullPath
      }
    }

    return null
  }

  /**
   * Profiles the application by running it in a child process
   */
  async #profileApp(loaderPath: string, entryPoint: string, cwd: string): Promise<ProfileResult> {
    return new Promise((promiseResolve, reject) => {
      const modules: ModuleTiming[] = []
      const providers: ProviderTiming[] = []
      let startTime = Date.now()
      let resolved = false

      const child = fork(entryPoint, [], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        execArgv: ['--import', '@poppinss/ts-exec', '--import', loaderPath, '--no-warnings'],
        env: {
          ...process.env,
          DOCTEUR_PROFILING: 'true',
          NODE_ENV: process.env.NODE_ENV || 'development',
        },
      })

      // Track when server is ready by watching stdout for the "started HTTP server" message
      let serverReady = false
      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        process.stdout.write(output)

        // Detect server ready message (JSON log from pino)
        if (!serverReady && output.includes('started HTTP server')) {
          serverReady = true
          // Server is ready, request results immediately
          if (child.connected) {
            child.send({ type: 'getResults' })
          }
        }
      })

      child.stderr?.on('data', (data: Buffer) => {
        process.stderr.write(data)
      })

      // Set a timeout for the profiling
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('Profiling timed out after 30 seconds'))
      }, 30000)

      // Handle messages from the child process
      child.on('message', (message: { type: string; data: unknown }) => {
        if (message.type === 'module') {
          modules.push(message.data as ModuleTiming)
        } else if (message.type === 'provider') {
          providers.push(message.data as ProviderTiming)
        } else if (message.type === 'results' && !resolved) {
          resolved = true
          clearTimeout(timeout)
          const data = message.data as {
            startTime: number
            endTime: number
            modules: ModuleTiming[]
          }
          startTime = data.startTime
          modules.push(...data.modules)
          const result = collectResults(modules, providers, startTime, data.endTime)
          // Kill child and resolve
          child.kill('SIGKILL')
          promiseResolve(result)
        }
      })

      // Handle child exit
      child.on('exit', (code) => {
        clearTimeout(timeout)

        // Already resolved via IPC, ignore exit
        if (resolved) {
          return
        }

        if (code !== null && code !== 0 && code !== 143 && code !== 137) {
          // 143 is SIGTERM, 137 is SIGKILL
          reject(new Error(`Child process exited with code ${code}`))
          return
        }

        // Fallback if we didn't get results via IPC
        resolved = true
        const endTime = Date.now()
        const result = collectResults(modules, providers, startTime, endTime)
        promiseResolve(result)
      })

      child.on('error', (error) => {
        if (resolved) return
        clearTimeout(timeout)
        reject(error)
      })

      // Fallback: if server ready message not detected after 10s, request results anyway
      const fallbackTimeout = setTimeout(() => {
        if (!resolved && !serverReady && child.connected) {
          child.send({ type: 'getResults' })
        }
      }, 10000)

      // Clean up fallback timeout when resolved
      const originalResolve = promiseResolve
      promiseResolve = (result) => {
        clearTimeout(fallbackTimeout)
        originalResolve(result)
      }
    })
  }

  /**
   * Builds the configuration from flags
   */
  #buildConfig(): ResolvedConfig {
    return {
      topModules: this.top,
      threshold: this.threshold,
      includeNodeModules: this.nodeModules,
      groupByPackage: this.group,
    }
  }
}
