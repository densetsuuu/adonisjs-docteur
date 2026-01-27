import { BaseCommand, flags } from '@adonisjs/core/ace'
import { type ChildProcess, fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { match, P } from 'ts-pattern'
import type { ModuleTiming, ProviderTiming } from '../types.js'
import { ProfileCollector } from './collector.js'

const TIMEOUT_MS = 30_000
const IGNORED_EXIT_CODES = [0, 137, 143] as const

type ResultsData = {
  startTime: number
  endTime: number
  loadTimes: Record<string, number>
  parents: Record<string, string>
  providers: ProviderTiming[]
}

type ResultsMessage = { type: 'results'; data: ResultsData }

interface ProfilerState {
  providers: ProviderTiming[]
  startTime: number
  endTime: number
  loadTimes: Map<string, number>
  parents: Map<string, string>
  done: boolean
}

function simplifyFileUrl(url: string, cwd: string) {
  return url.replace(`file://${cwd}`, '.').replace('file://', '')
}

export default abstract class BaseProfilerCommand extends BaseCommand {
  @flags.string({
    description: 'Entry point to profile (defaults to bin/server.ts)',
  })
  declare entry: string

  protected findLoaderPath() {
    return fileURLToPath(import.meta.resolve('docteur/profiler/loader'))
  }

  protected findEntryPoint(cwd: string) {
    const entryPath = join(cwd, this.entry || 'bin/server.ts')
    if (!existsSync(entryPath)) {
      throw new Error(`Entry point not found: ${entryPath}`)
    }
    return entryPath
  }

  protected validatePaths(cwd: string) {
    try {
      return {
        loaderPath: this.findLoaderPath(),
        entryPoint: this.findEntryPoint(cwd),
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'Validation failed')
      this.exitCode = 1
      return null
    }
  }

  protected async profileApp(
    loaderPath: string,
    entryPoint: string,
    cwd: string,
    options?: { suppressOutput?: boolean }
  ) {
    const state = await this.#runProfiledProcess(loaderPath, entryPoint, cwd, options)
    return this.#buildResults(state, cwd)
  }

  #runProfiledProcess(
    loaderPath: string,
    entryPoint: string,
    cwd: string,
    options?: { suppressOutput?: boolean }
  ): Promise<ProfilerState> {
    const suppressOutput = options?.suppressOutput ?? false

    return new Promise((resolve, reject) => {
      const state: ProfilerState = {
        providers: [],
        startTime: 0,
        endTime: 0,
        loadTimes: new Map(),
        parents: new Map(),
        done: false,
      }

      const child = fork(entryPoint, [], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        execArgv: ['--import', loaderPath, '--import', '@poppinss/ts-exec', '--no-warnings'],
        env: { ...process.env, DOCTEUR_PROFILING: 'true' },
      })

      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Profiling timed out after ${TIMEOUT_MS / 1000} seconds`))
      }, TIMEOUT_MS)

      const complete = () => {
        if (state.done) return
        state.done = true
        clearTimeout(timeout)
        child.kill('SIGTERM')

        // Force kill after 500ms if still alive
        const forceKill = setTimeout(() => child.kill('SIGKILL'), 500)
        child.once('exit', () => {
          clearTimeout(forceKill)
          resolve(state)
        })
      }

      child.stdout?.on('data', (data: Buffer) => this.#onStdout(data, child, suppressOutput))
      child.stderr?.on('data', (data: Buffer) => this.#onStderr(data, suppressOutput))
      child.on('message', (msg: unknown) => this.#onMessage(msg, state, complete))
      child.on('error', (err) => this.#onError(err, reject, timeout))
      child.on('exit', (code) => this.#onExit(code, state, reject, timeout))
    })
  }

  #onStdout(data: Buffer, child: ChildProcess, suppressOutput: boolean) {
    const output = data.toString()
    if (!suppressOutput) process.stdout.write(output)

    if (output.includes('started HTTP server')) {
      child.send({ type: 'getResults' })
    }
  }

  #onStderr(data: Buffer, suppressOutput: boolean) {
    if (!suppressOutput) process.stderr.write(data)
  }

  #onMessage(message: unknown, state: ProfilerState, complete: () => void) {
    match(message as ResultsMessage | { type: string })
      .with({ type: 'results' }, (msg) => {
        const data = (msg as ResultsMessage).data
        state.startTime = data.startTime
        state.endTime = data.endTime
        state.loadTimes = new Map(Object.entries(data.loadTimes))
        state.parents = new Map(Object.entries(data.parents || {}))
        state.providers = data.providers || []
        complete()
      })
      .otherwise(() => {})
  }

  #onError(error: Error, reject: (error: Error) => void, timeout: NodeJS.Timeout) {
    clearTimeout(timeout)
    reject(error)
  }

  #onExit(
    code: number | null,
    state: ProfilerState,
    reject: (error: Error) => void,
    timeout: NodeJS.Timeout
  ) {
    match(code)
      .with(null, ...IGNORED_EXIT_CODES, () => {})
      .with(P.number, (c) => {
        if (!state.done) {
          clearTimeout(timeout)
          reject(new Error(`Process exited with code ${c}`))
        }
      })
      .exhaustive()
  }

  #buildResults(state: ProfilerState, cwd: string) {
    const modules: ModuleTiming[] = [...state.loadTimes].map(([url, loadTime]) => ({
      specifier: simplifyFileUrl(url, cwd),
      resolvedUrl: url,
      loadTime,
      resolveTime: 0,
      startTime: 0,
      endTime: 0,
      parentUrl: state.parents.get(url),
    }))

    const collector = new ProfileCollector(modules, state.providers)
    return collector.collectResults(state.startTime, state.endTime)
  }

  async completed() {
    if (this.error) {
      this.logger.error('Profiling failed')
      if (this.error instanceof Error) this.logger.error(this.error.message)

      return true
    }
  }
}
