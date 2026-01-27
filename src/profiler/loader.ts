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

// Listen for batched parent relationships from hooks
type ParentData = { child: string; parent: string }

port1.on('message', (message: { type: string; batch?: ParentData[] }) => {
  if (message.type === 'parents' && message.batch) {
    for (const { child, parent } of message.batch) {
      parents.set(child, parent)
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
    getExecTimes: () => Map<string, number>
    getParents: () => Map<string, string>
    isEnabled: boolean
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __docteurExecTimes: Map<string, number>
}

// Execution times are set directly by wrapped modules
globalThis.__docteurExecTimes = new Map()

globalThis.__docteur__ = {
  startTime: profileStartTime,
  getExecTimes: () => globalThis.__docteurExecTimes,
  getParents: () => parents,
  isEnabled: true,
}

if (process.send) {
  process.on('message', (message: { type: string }) => {
    if (message.type === 'getResults') {
      process.send!({
        type: 'results',
        data: {
          startTime: profileStartTime,
          endTime: performance.now(),
          execTimes: Object.fromEntries(globalThis.__docteurExecTimes),
          parents: Object.fromEntries(parents),
        },
      })
    }
  })
}
