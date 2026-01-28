/*
|--------------------------------------------------------------------------
| Profiler Loader
|--------------------------------------------------------------------------
|
| Registers ESM hooks for module timing and subscribes to AdonisJS
| tracing channels for provider lifecycle timing.
|
*/

import { register } from 'node:module'
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

const { tracingChannels } = (await import('@adonisjs/application')) as {
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
;(port1 as { unref?: () => void }).unref?.()

port1.on(
  'message',
  (msg: { type: string; messages?: { type: string; [k: string]: unknown }[] }) => {
    if (msg.type !== 'batch' || !msg.messages) return

    for (const m of msg.messages) {
      if (m.type === 'parent') parents.set(m.child as string, m.parent as string)
      else if (m.type === 'timing') loadTimes.set(m.url as string, m.loadTime as number)
    }
  }
)

register('./hooks.js', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
})

// Subscribe to provider lifecycle phases
// For async methods: start -> end -> asyncStart -> asyncEnd (we wait for asyncEnd)
// For sync methods: start -> end (we record on end, but defer to check if async fires)

function subscribePhase(channel: TracingChannel, phase: string) {
  const getName = (msg: unknown) =>
    (msg as { provider: { constructor: { name: string } } }).provider.constructor.name

  channel.subscribe({
    start(msg) {
      providerStarts.set(`${getName(msg)}:${phase}`, performance.now())
    },
    end(msg) {
      const name = getName(msg)
      const key = `${name}:${phase}`
      const endTime = performance.now()

      // Defer to check if this becomes async (asyncStart fires before our setTimeout)
      setTimeout(() => {
        if (asyncCalls.has(key)) return
        const start = providerStarts.get(key)
        if (start !== undefined) {
          const phases = providerPhases.get(name) || {}
          phases[phase] = endTime - start
          providerPhases.set(name, phases)
          providerStarts.delete(key)
        }
      }, 0)
    },
    asyncStart(msg) {
      asyncCalls.add(`${getName(msg)}:${phase}`)
    },
    asyncEnd(msg) {
      const name = getName(msg)
      const key = `${name}:${phase}`
      const start = providerStarts.get(key)

      if (start !== undefined) {
        const phases = providerPhases.get(name) || {}
        phases[phase] = performance.now() - start
        providerPhases.set(name, phases)
        providerStarts.delete(key)
      }
      asyncCalls.delete(key)
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

    const providers = [...providerPhases.entries()].map(([name, t]) => ({
      name,
      registerTime: t.register || 0,
      bootTime: t.boot || 0,
      startTime: t.start || 0,
      readyTime: t.ready || 0,
      shutdownTime: t.shutdown || 0,
      totalTime: (t.register || 0) + (t.boot || 0) + (t.start || 0) + (t.ready || 0),
    }))

    process.send!({
      type: 'results',
      data: {
        loadTimes: Object.fromEntries(loadTimes),
        parents: Object.fromEntries(parents),
        providers,
      },
    })
  })
}
