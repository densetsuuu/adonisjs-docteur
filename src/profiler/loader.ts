/*
|--------------------------------------------------------------------------
| Profiler Loader
|--------------------------------------------------------------------------
|
| Entry point for the profiler. Registers ESM hooks and collects timing data.
|
*/

import { register } from 'node:module'
import { performance } from 'node:perf_hooks'
import { MessageChannel } from 'node:worker_threads'

const profileStartTime = performance.now()
const { port1, port2 } = new MessageChannel()

const parents = new Map<string, string>()
const loadTimes = new Map<string, number>()

// Provider timing data: Map<providerName, { register, boot, start, ready, shutdown }>
const providerTimings = new Map<string, Record<string, number>>()

type HookMessage =
  | { type: 'parent'; child: string; parent: string }
  | { type: 'timing'; url: string; loadTime: number }

// Listen for batched messages from hooks
port1.on('message', (message: { type: string; messages?: HookMessage[] }) => {
  if (message.type === 'batch' && message.messages) {
    for (const msg of message.messages) {
      if (msg.type === 'parent') {
        parents.set(msg.child, msg.parent)
      } else if (msg.type === 'timing') {
        loadTimes.set(msg.url, msg.loadTime)
      }
    }
  }
})
;(port1 as unknown as { unref?: () => void }).unref?.()

register('./hooks.js', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
})

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __docteur__: {
    startTime: number
    getLoadTimes: () => Map<string, number>
    getParents: () => Map<string, string>
    isEnabled: boolean
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __docteurReportProvider__: (name: string, phase: string, duration: number) => void
}

globalThis.__docteur__ = {
  startTime: profileStartTime,
  getLoadTimes: () => loadTimes,
  getParents: () => parents,
  isEnabled: true,
}

// Global hook for providers to report their lifecycle timing
globalThis.__docteurReportProvider__ = (name: string, phase: string, duration: number) => {
  let timing = providerTimings.get(name)
  if (!timing) {
    timing = {}
    providerTimings.set(name, timing)
  }
  timing[phase] = duration
}

if (process.send) {
  process.on('message', (message: { type: string }) => {
    if (message.type === 'getResults') {
      // Convert provider timings to the expected format
      const providers = Array.from(providerTimings.entries()).map(([name, timing]) => ({
        name,
        registerTime: timing.register || 0,
        bootTime: timing.boot || 0,
        startTime: timing.start || 0,
        readyTime: timing.ready || 0,
        shutdownTime: timing.shutdown || 0,
        totalTime:
          (timing.register || 0) + (timing.boot || 0) + (timing.start || 0) + (timing.ready || 0),
      }))

      process.send!({
        type: 'results',
        data: {
          startTime: profileStartTime,
          endTime: performance.now(),
          loadTimes: Object.fromEntries(loadTimes),
          parents: Object.fromEntries(parents),
          providers,
        },
      })
    }
  })
}
