/*
|--------------------------------------------------------------------------
| Profiler Loader
|--------------------------------------------------------------------------
|
| Registers ESM hooks for module timing and subscribes to AdonisJS
| tracing channels for provider lifecycle timing.
|
*/

import { createRequire, register } from 'node:module'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { MessageChannel } from 'node:worker_threads'

type TracingChannel = {
  subscribe(handlers: {
    start(msg: unknown): void
    end(msg: unknown): void
    asyncStart(msg: unknown): void
    asyncEnd(msg: unknown): void
    error(): void
  }): void
}

const require = createRequire(join(process.cwd(), 'node_modules', '_'))

let tracingChannels: Record<string, TracingChannel> | null = null
try {
  const adonisApp = require('@adonisjs/application') as {
    tracingChannels: Record<string, TracingChannel>
  }
  tracingChannels = adonisApp.tracingChannels
} catch {
  // @adonisjs/application not available - provider tracing will be disabled
}

/**
 * Module timing data collected via ESM hooks
 */
const parents = new Map<string, string>()
const loadTimes = new Map<string, number>()

const { port1, port2 } = new MessageChannel()
port1.unref()

port1.on('message', (msg: { type: string; [k: string]: unknown }) => {
  if (msg.type === 'parent') parents.set(msg.child as string, msg.parent as string)
  else if (msg.type === 'timing') loadTimes.set(msg.url as string, msg.loadTime as number)
})

register('./hooks.js', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
})

/**
 * Provider lifecycle timing via tracing channels.
 *
 * Tracing channels emit: start → end (sync) or start → end → asyncStart → asyncEnd (async).
 * We defer sync recording with setTimeout so asyncStart can claim the phase first.
 */
const providerPhases = new Map<string, Record<string, number>>()
const starts = new Map<string, number>()
const asyncPhases = new Set<string>()

function name(msg: unknown) {
  return (msg as { provider: { constructor: { name: string } } }).provider.constructor.name
}

function record(provider: string, phase: string, endTime: number) {
  const start = starts.get(`${provider}:${phase}`)
  if (start === undefined) return

  const phases = providerPhases.get(provider) ?? {}
  phases[phase] = endTime - start
  providerPhases.set(provider, phases)
  starts.delete(`${provider}:${phase}`)
}

const phases = ['register', 'boot', 'start', 'ready', 'shutdown'] as const

if (tracingChannels) {
  for (const phase of phases) {
    const channelKey =
      `provider${phase[0].toUpperCase()}${phase.slice(1)}` as keyof typeof tracingChannels

    tracingChannels[channelKey].subscribe({
      start(msg) {
        starts.set(`${name(msg)}:${phase}`, performance.now())
      },
      end(msg) {
        const provider = name(msg)
        const endTime = performance.now()
        const key = `${provider}:${phase}`
        setTimeout(() => {
          if (!asyncPhases.has(key)) record(provider, phase, endTime)
        }, 0)
      },
      asyncStart(msg) {
        asyncPhases.add(`${name(msg)}:${phase}`)
      },
      asyncEnd(msg) {
        const provider = name(msg)
        record(provider, phase, performance.now())
        asyncPhases.delete(`${provider}:${phase}`)
      },
      error() {},
    })
  }
}

/**
 * IPC: send collected results to parent process
 */
if (process.send) {
  process.on('message', (msg: { type: string }) => {
    if (msg.type !== 'getResults') return

    process.send!({
      type: 'results',
      data: {
        loadTimes: Object.fromEntries(loadTimes),
        parents: Object.fromEntries(parents),
        providerPhases: Object.fromEntries(providerPhases),
      },
    })
  })
}
