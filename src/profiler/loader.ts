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
const { tracingChannels } = require('@adonisjs/application') as {
  tracingChannels: Record<string, TracingChannel>
}

// Module timing data from hooks
const parents = new Map<string, string>()
const loadTimes = new Map<string, number>()

// Provider timing data
const providerPhases = new Map<string, Record<string, number>>()
const providerStarts = new Map<string, number>()
const asyncCalls = new Set<string>()

// Set up message channel for hooks
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

// Subscribe to provider lifecycle phases
// For async methods: start -> end -> asyncStart -> asyncEnd (we wait for asyncEnd)
// For sync methods: start -> end (we record on end, but defer to check if async fires)

function getProviderName(msg: unknown) {
  return (msg as { provider: { constructor: { name: string } } }).provider.constructor.name
}

function recordPhase(name: string, phase: string, endTime: number) {
  const key = `${name}:${phase}`
  const start = providerStarts.get(key)
  if (start === undefined) return

  const phases = providerPhases.get(name) || {}
  phases[phase] = endTime - start
  providerPhases.set(name, phases)
  providerStarts.delete(key)
}

function subscribePhase(channel: TracingChannel, phase: string) {
  channel.subscribe({
    start(msg) {
      providerStarts.set(`${getProviderName(msg)}:${phase}`, performance.now())
    },
    end(msg) {
      const name = getProviderName(msg)
      const key = `${name}:${phase}`
      const endTime = performance.now()

      // Defer to check if this becomes async (asyncStart fires before our setTimeout)
      setTimeout(() => {
        if (!asyncCalls.has(key)) recordPhase(name, phase, endTime)
      }, 0)
    },
    asyncStart(msg) {
      asyncCalls.add(`${getProviderName(msg)}:${phase}`)
    },
    asyncEnd(msg) {
      const name = getProviderName(msg)
      recordPhase(name, phase, performance.now())
      asyncCalls.delete(`${name}:${phase}`)
    },
    error() {},
  })
}

subscribePhase(tracingChannels.providerRegister, 'register')
subscribePhase(tracingChannels.providerBoot, 'boot')
subscribePhase(tracingChannels.providerStart, 'start')
subscribePhase(tracingChannels.providerReady, 'ready')
subscribePhase(tracingChannels.providerShutdown, 'shutdown')

// Send results to parent process when requested
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
