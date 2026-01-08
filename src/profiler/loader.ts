/*
|--------------------------------------------------------------------------
| ESM Loader Entry Point
|--------------------------------------------------------------------------
|
| This file is loaded via Node's --import flag to install the profiling
| hooks before any application code runs.
|
*/

import { register } from 'node:module'
import { MessageChannel } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import type { ModuleTiming } from '../types.js'

// Record the very start time
const profileStartTime = performance.now()

// Create a message channel for communication with the hooks
const { port1, port2 } = new MessageChannel()

// Store for all module timings
const moduleTimings: ModuleTiming[] = []

// Listen for timing data from the hooks
port1.on('message', (message: { type: string; data: ModuleTiming }) => {
  if (message.type === 'module') {
    moduleTimings.push(message.data)
  }
})

// Allow the process to exit even if port is active
;(port1 as unknown as { unref?: () => void }).unref?.()

// Register the hooks with the message port
register('./hooks.js', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
})

// Expose timing data globally for the analyze command to access
declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __docteur__: {
    startTime: number
    getTimings: () => ModuleTiming[]
    isEnabled: boolean
  }
}

globalThis.__docteur__ = {
  startTime: profileStartTime,
  getTimings: () => [...moduleTimings],
  isEnabled: true,
}

// Handle IPC messages from parent process
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
          modules: moduleTimings,
        },
      })
    }
  })
}
