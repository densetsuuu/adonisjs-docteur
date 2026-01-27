/*
|--------------------------------------------------------------------------
| Module Loader Hooks
|--------------------------------------------------------------------------
|
| ESM loader hooks for tracking module loading and provider timing.
| Instruments AdonisJS providers to measure lifecycle method durations.
|
*/

import type { MessagePort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'

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
const pendingMessages: Array<{ type: string; [key: string]: unknown }> = []
let flushScheduled = false
const textDecoder = new TextDecoder()

function flush() {
  flushScheduled = false
  if (pendingMessages.length > 0 && port) {
    port.postMessage({ type: 'batch', messages: pendingMessages.splice(0) })
  }
}

function queueMessage(msg: { type: string; [key: string]: unknown }) {
  pendingMessages.push(msg)
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
    queueMessage({ type: 'parent', child: result.url, parent: context.parentURL })
  }

  return result
}

/**
 * Check if this is a provider file that should be instrumented.
 * Matches files ending in _provider.js/ts or in a providers directory.
 */
function isProviderFile(url: string): boolean {
  // Match files ending in _provider.js or in a providers/ directory
  return url.includes('_provider.') || url.includes('/providers/') || url.includes('\\providers\\')
}

/**
 * Wraps a provider's default export to instrument lifecycle methods.
 * Finds the provider class by looking for common naming patterns and wraps its prototype.
 */
function wrapProvider(source: string, url: string): string {
  // Extract provider name from URL for reporting
  const match = url.match(/([^/\\]+?)(?:_provider)?\.(?:js|ts)$/i)
  const providerName = match ? match[1].replace(/_/g, ' ') : 'unknown'

  // Find the class name that's exported as default
  // Pattern: export { ClassName as default }
  const exportMatch = source.match(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/)
  if (!exportMatch) {
    // Try: export default ClassName or export default class
    const defaultMatch = source.match(/export\s+default\s+(?:class\s+)?(\w+)/)
    if (!defaultMatch) return source
  }

  const className = exportMatch?.[1] || source.match(/export\s+default\s+(?:class\s+)?(\w+)/)?.[1]
  if (!className) return source

  return `${source}
;(function() {
  const _Provider = typeof ${className} !== 'undefined' ? ${className} : null;
  if (!_Provider || typeof _Provider !== 'function') return;

  const _methods = ['register', 'boot', 'start', 'ready', 'shutdown'];
  const _proto = _Provider.prototype;
  const _name = _Provider.name || '${providerName}';

  _methods.forEach(method => {
    const orig = _proto[method];
    if (typeof orig !== 'function') return;

    _proto[method] = async function(...args) {
      const start = performance.now();
      try {
        return await orig.apply(this, args);
      } finally {
        const duration = performance.now() - start;
        if (globalThis.__docteurReportProvider__) {
          globalThis.__docteurReportProvider__(_name, method, duration);
        }
      }
    };
  });
})();
`
}

/**
 * Load hook - tracks module loading and instruments providers.
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

  const start = performance.now()
  const result = await nextLoad(url, context)
  const loadTime = performance.now() - start

  if (result.format === 'module') {
    queueMessage({ type: 'timing', url, loadTime })

    // Instrument provider files to measure lifecycle methods
    if (isProviderFile(url) && result.source) {
      const sourceStr =
        typeof result.source === 'string'
          ? result.source
          : textDecoder.decode(result.source as ArrayBuffer)
      return { ...result, source: wrapProvider(sourceStr, url) }
    }
  }

  return result
}
