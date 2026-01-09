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

const timings = new Map<string, Partial<ModuleTiming>>()
const resolveTimings = new Map<string, number>()

let messagePort: MessagePort | null = null

export function initialize(data: { port: MessagePort }) {
  messagePort = data.port
}

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve
): Promise<{ url: string; format?: string; shortCircuit?: boolean }> {
  const startTime = performance.now()
  const result = await nextResolve(specifier, context)
  const resolveTime = performance.now() - startTime

  resolveTimings.set(result.url, resolveTime)

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

function isUserModule(url: string): boolean {
  return url.startsWith('file://') && !url.includes('node_modules')
}

function wrapSourceWithTiming(source: string, url: string): string {
  const escapedUrl = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `const __docteurExecStart = performance.now();
${source}
globalThis.__docteurExecTimes?.set('${escapedUrl}', performance.now() - __docteurExecStart);
`
}

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

  if (messagePort) {
    messagePort.postMessage({
      type: 'module',
      data: timing,
    })
  }

  // Inject execution timing code into user modules
  if (isUserModule(url) && result.source && result.format === 'module') {
    const sourceStr =
      typeof result.source === 'string'
        ? result.source
        : new TextDecoder().decode(result.source as ArrayBuffer)

    return {
      ...result,
      source: wrapSourceWithTiming(sourceStr, url),
    }
  }

  return result
}
