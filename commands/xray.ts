/*
|--------------------------------------------------------------------------
| Docteur X-Ray Command
|--------------------------------------------------------------------------
|
| Interactive TUI for exploring module dependencies and cold start times.
|
*/

import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import React from 'react'
import { render } from 'ink'
import type { ModuleTiming, ProfileResult, ProviderTiming } from '../src/types.js'
import { collectResults } from '../src/profiler/collector.js'
import { XRayApp } from '../src/xray/components/XRayApp.js'

/**
 * Returns metadata for all commands exported by this module
 */
export function getMetaData() {
  return [XRay.serialize()]
}

/**
 * Returns the command class for a given command name
 */
export async function getCommand(_name: string) {
  return XRay
}

export default class XRay extends BaseCommand {
  static commandName = 'docteur:xray'
  static description = 'Interactive module dependency explorer'

  static options: CommandOptions = {
    startApp: false,
    staysAlive: true, // Keep alive for interactive TUI
  }

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

    this.logger.info('Profiling application...')

    try {
      const result = await this.#profileApp(loaderPath, entryPoint, cwd)

      // Clear the terminal and render the TUI
      console.clear()
      const { waitUntilExit } = render(React.createElement(XRayApp, { result, cwd }))
      await waitUntilExit()
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

      let serverReady = false
      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        // Don't print output during profiling for xray
        if (!serverReady && output.includes('started HTTP server')) {
          serverReady = true
          if (child.connected) {
            child.send({ type: 'getResults' })
          }
        }
      })

      child.stderr?.on('data', (_data: Buffer) => {
        // Suppress stderr during profiling
      })

      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('Profiling timed out after 30 seconds'))
      }, 30000)

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
          child.kill('SIGKILL')
          promiseResolve(result)
        }
      })

      child.on('exit', (code) => {
        clearTimeout(timeout)
        if (resolved) return
        if (code !== null && code !== 0 && code !== 143 && code !== 137) {
          reject(new Error(`Child process exited with code ${code}`))
          return
        }
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

      const fallbackTimeout = setTimeout(() => {
        if (!resolved && !serverReady && child.connected) {
          child.send({ type: 'getResults' })
        }
      }, 10000)

      const originalResolve = promiseResolve
      promiseResolve = (result) => {
        clearTimeout(fallbackTimeout)
        originalResolve(result)
      }
    })
  }
}
