/*
|--------------------------------------------------------------------------
| Core Profiler
|--------------------------------------------------------------------------
|
| Standalone profiler that doesn't depend on AdonisJS Ace framework.
| Used by both the CLI and the ace commands.
|
*/

import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { ModuleTiming, ProfileResult, ProviderTiming } from '../types.js'
import { ProfileCollector } from './collector.js'
import { simplifyUrl } from './reporters/format.js'

const TIMEOUT_MS = 30_000

type ResultsData = {
  loadTimes: Record<string, number>
  parents: Record<string, string>
  providers: ProviderTiming[]
}

interface ProfilerState {
  providers: ProviderTiming[]
  loadTimes: Map<string, number>
  parents: Map<string, string>
  bootDuration?: [number, number]
  done: boolean
}

export interface ProfileOptions {
  entryPoint?: string
  suppressOutput?: boolean
}

export function findLoaderPath(): string {
  return fileURLToPath(import.meta.resolve('docteur/profiler/loader'))
}

export function findEntryPoint(cwd: string, entry?: string): string {
  const entryPath = join(cwd, entry || 'bin/server.ts')
  if (!existsSync(entryPath)) {
    throw new Error(`Entry point not found: ${entryPath}`)
  }
  return entryPath
}

export function isAdonisProject(cwd: string): boolean {
  return existsSync(join(cwd, 'adonisrc.ts')) || existsSync(join(cwd, '.adonisrc.ts'))
}

export async function profile(cwd: string, options: ProfileOptions = {}): Promise<ProfileResult> {
  const loaderPath = findLoaderPath()
  const entryPoint = findEntryPoint(cwd, options.entryPoint)
  const state = await runProfiledProcess(loaderPath, entryPoint, cwd, options)
  return buildResults(state, cwd)
}

function runProfiledProcess(
  loaderPath: string,
  entryPoint: string,
  cwd: string,
  options: ProfileOptions
): Promise<ProfilerState> {
  const suppressOutput = options.suppressOutput ?? false

  return new Promise((resolve, reject) => {
    const state: ProfilerState = {
      providers: [],
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

      const forceKill = setTimeout(() => child.kill('SIGKILL'), 500)
      child.once('exit', () => {
        clearTimeout(forceKill)
        resolve(state)
      })
    }

    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      if (!suppressOutput) process.stdout.write(output)
      if (output.includes('started HTTP server')) {
        child.send({ type: 'getResults' })
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      if (!suppressOutput) process.stderr.write(data)
    })

    child.on('message', (message: unknown) => {
      const msg = message as Record<string, unknown>
      if (msg.isAdonisJS === true && msg.environment === 'web' && msg.duration) {
        state.bootDuration = msg.duration as [number, number]
        return
      }
      if (msg.type === 'results') {
        const data = (msg as { type: 'results'; data: ResultsData }).data
        state.loadTimes = new Map(Object.entries(data.loadTimes))
        state.parents = new Map(Object.entries(data.parents || {}))
        state.providers = data.providers || []
        complete()
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      if (code !== null && code !== 0 && code !== 137 && code !== 143 && !state.done) {
        clearTimeout(timeout)
        reject(new Error(`Process exited with code ${code}`))
      }
    })
  })
}

function buildResults(state: ProfilerState, cwd: string): ProfileResult {
  const modules: ModuleTiming[] = [...state.loadTimes].map(([url, loadTime]) => ({
    specifier: simplifyUrl(url, cwd),
    resolvedUrl: url,
    loadTime,
    parentUrl: state.parents.get(url),
  }))

  const collector = new ProfileCollector(modules, state.providers)

  const bootTimeMs = state.bootDuration
    ? state.bootDuration[0] * 1000 + state.bootDuration[1] / 1_000_000
    : 0

  return collector.collectResults(bootTimeMs)
}
