/*
|--------------------------------------------------------------------------
| Module Loader Hooks
|--------------------------------------------------------------------------
|
| ESM loader hooks for measuring module execution times.
| Wraps modules with timing code to measure actual execution duration.
|
*/

import type { MessagePort } from 'node:worker_threads'

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

let port: MessagePort | null = null
const pendingParents: Array<{ child: string; parent: string }> = []
let flushScheduled = false
const textDecoder = new TextDecoder()

function flush() {
  flushScheduled = false
  if (pendingParents.length > 0 && port) {
    port.postMessage({ type: 'parents', batch: pendingParents.splice(0) })
  }
}

function queueParent(child: string, parent: string) {
  pendingParents.push({ child, parent })
  if (!flushScheduled) {
    flushScheduled = true
    setImmediate(flush)
  }
}

export function initialize(data: { port: MessagePort }) {
  port = data.port
}

/**
 * Resolve hook - tracks parent-child relationships.
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve
): Promise<{ url: string; format?: string; shortCircuit?: boolean }> {
  const result = await nextResolve(specifier, context)

  if (context.parentURL && result.url.startsWith('file://')) {
    queueParent(result.url, context.parentURL)
  }

  return result
}

/**
 * Wraps module source with execution timing.
 */
function wrapWithTiming(source: string, url: string): string {
  const escapedUrl = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `const __t=performance.now();${source};globalThis.__docteurExecTimes?.set('${escapedUrl}',performance.now()-__t);`
}

/**
 * Load hook - wraps file:// modules with execution timing.
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
  if (!url.startsWith('file://')) {
    return nextLoad(url, context)
  }

  const result = await nextLoad(url, context)

  if (result.source && result.format === 'module') {
    const sourceStr =
      typeof result.source === 'string'
        ? result.source
        : textDecoder.decode(result.source as ArrayBuffer)

    return { ...result, source: wrapWithTiming(sourceStr, url) }
  }

  return result
}
