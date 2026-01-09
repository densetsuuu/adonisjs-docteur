import { register } from 'node:module'
import { performance } from 'node:perf_hooks'
import { MessageChannel } from 'node:worker_threads'

import type { ModuleTiming } from '../types.js'

const profileStartTime = performance.now()
const { port1, port2 } = new MessageChannel()
const moduleTimings: ModuleTiming[] = []

port1.on('message', (message: { type: string; data: ModuleTiming }) => {
  if (message.type === 'module') {
    moduleTimings.push(message.data)
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
    getTimings: () => ModuleTiming[]
    isEnabled: boolean
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __docteurExecTimes: Map<string, number>
}

// Set up global exec times map before any modules load
globalThis.__docteurExecTimes = new Map()

function getTimingsWithExecTimes(): ModuleTiming[] {
  return moduleTimings.map((timing) => {
    const execTime = globalThis.__docteurExecTimes.get(timing.resolvedUrl)
    return execTime !== undefined ? { ...timing, execTime } : timing
  })
}

globalThis.__docteur__ = {
  startTime: profileStartTime,
  getTimings: getTimingsWithExecTimes,
  isEnabled: true,
}

if (process.send) {
  process.on('message', (message: { type: string }) => {
    if (message.type === 'getResults') {
      const endTime = performance.now()
      process.send!({
        type: 'results',
        data: {
          startTime: profileStartTime,
          endTime,
          totalTime: endTime - profileStartTime,
          modules: getTimingsWithExecTimes(),
        },
      })
    }
  })
}
