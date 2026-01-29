/*
|--------------------------------------------------------------------------
| ESM Loader Hooks
|--------------------------------------------------------------------------
|
| Tracks module loading times and parent-child relationships.
| - resolve: captures which module imported which (for subtree calculation)
| - load: measures how long each module takes to load
|
*/

import type { MessagePort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'

type ResolveFn = (specifier: string, context?: { parentURL?: string }) => Promise<{ url: string }>

type LoadFn = (
  url: string,
  context?: { format?: string }
) => Promise<{ format: string; source: string | ArrayBuffer | SharedArrayBuffer }>

let port: MessagePort

export function initialize(data: { port: MessagePort }) {
  port = data.port
}

export async function resolve(specifier: string, context: { parentURL?: string }, next: ResolveFn) {
  const result = await next(specifier, context)

  if (context.parentURL && result.url.startsWith('file://')) {
    port.postMessage({ type: 'parent', child: result.url, parent: context.parentURL })
  }

  return result
}

export async function load(url: string, context: { format?: string }, next: LoadFn) {
  if (!url.startsWith('file://')) {
    return next(url, context)
  }

  const start = performance.now()
  const result = await next(url, context)

  if (result.format === 'module') {
    port.postMessage({ type: 'timing', url, loadTime: performance.now() - start })
  }

  return result
}
