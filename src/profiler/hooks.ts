/*
|--------------------------------------------------------------------------
| ESM Loader Hooks
|--------------------------------------------------------------------------
|
| These hooks are registered via module.register() and run in a separate
| thread to intercept and time module loading.
|
*/

import { performance } from 'node:perf_hooks'
import type { MessagePort } from 'node:worker_threads'
import type { ModuleTiming } from '../types.js'

interface ResolveContext {
  conditions: string[]
  importAttributes: Record<string, string>
  parentURL?: string
}

interface LoadContext {
  conditions: string[]
  format?: string
  importAttributes: Record<string, string>
}

type NextResolve = (
  specifier: string,
  context?: ResolveContext
) => Promise<{ url: string; format?: string; shortCircuit?: boolean }>

type NextLoad = (
  url: string,
  context?: LoadContext
) => Promise<{
  format: string
  source: string | ArrayBuffer | SharedArrayBuffer
  shortCircuit?: boolean
}>

/**
 * Store for timing data - shared via port messaging
 */
const timings = new Map<string, Partial<ModuleTiming>>()
const resolveTimings = new Map<string, number>()

let messagePort: MessagePort | null = null

/**
 * Initialize the hooks with a message port for communication
 */
export function initialize(data: { port: MessagePort }) {
  messagePort = data.port
}

/**
 * Resolve hook - times module resolution
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve
): Promise<{ url: string; format?: string; shortCircuit?: boolean }> {
  const startTime = performance.now()

  const result = await nextResolve(specifier, context)

  const resolveTime = performance.now() - startTime
  resolveTimings.set(result.url, resolveTime)

  // Store partial timing data
  const existing = timings.get(result.url) || {}
  timings.set(result.url, {
    ...existing,
    specifier,
    resolvedUrl: result.url,
    resolveTime,
    parentUrl: context.parentURL,
  })

  return result
}

/**
 * Load hook - times module loading and evaluation
 */
export async function load(
  url: string,
  context: LoadContext,
  nextLoad: NextLoad
): Promise<{
  format: string
  source: string | ArrayBuffer | SharedArrayBuffer
  shortCircuit?: boolean
}> {
  const startTime = performance.now()

  const result = await nextLoad(url, context)

  const endTime = performance.now()
  const loadTime = endTime - startTime

  // Complete timing data
  const existing = timings.get(url) || {}
  const timing: ModuleTiming = {
    specifier: existing.specifier || url,
    resolvedUrl: url,
    loadTime,
    resolveTime: existing.resolveTime || resolveTimings.get(url) || 0,
    parentUrl: existing.parentUrl,
    startTime,
    endTime,
  }

  timings.set(url, timing)

  // Send timing data to main thread
  if (messagePort) {
    messagePort.postMessage({
      type: 'module',
      data: timing,
    })
  }

  return result
}
