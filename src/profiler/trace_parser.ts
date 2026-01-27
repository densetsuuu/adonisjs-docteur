/*
|--------------------------------------------------------------------------
| Trace Events Parser
|--------------------------------------------------------------------------
|
| Parses Node.js trace event files to extract accurate module load times.
| Uses the node.module_timer category which tracks require/import timing
| at the Node.js runtime level with zero instrumentation overhead.
|
*/

import { readFile, unlink } from 'node:fs/promises'

interface TraceEvent {
  pid: number
  tid: number
  ts: number
  ph: string
  cat: string
  name: string
  dur?: number
  args?: Record<string, unknown>
  id?: string
}

interface TraceFile {
  traceEvents: TraceEvent[]
}

export interface ModuleLoadTiming {
  name: string
  loadTimeUs: number
  loadTimeMs: number
}

/**
 * Parses a trace event file and extracts module load timings.
 * Pairs begin (ph: "b") and end (ph: "e") events to calculate durations.
 */
export async function parseTraceFile(filePath: string): Promise<ModuleLoadTiming[]> {
  const content = await readFile(filePath, 'utf-8')
  const trace: TraceFile = JSON.parse(content)

  const moduleEvents = trace.traceEvents.filter(
    (event) => event.cat.includes('node.module_timer') && event.name.startsWith('require(')
  )

  const beginEvents = new Map<string, TraceEvent>()
  const timings: ModuleLoadTiming[] = []

  for (const event of moduleEvents) {
    const key = `${event.tid}-${event.name}`

    if (event.ph === 'b') {
      beginEvents.set(key, event)
    } else if (event.ph === 'e') {
      const beginEvent = beginEvents.get(key)
      if (beginEvent) {
        const loadTimeUs = event.ts - beginEvent.ts
        timings.push({
          name: event.name,
          loadTimeUs,
          loadTimeMs: loadTimeUs / 1000,
        })
        beginEvents.delete(key)
      }
    }
  }

  return timings
}

/**
 * Parses a specific trace file.
 */
export async function findAndParseTraceFiles(traceFilePath: string): Promise<ModuleLoadTiming[]> {
  try {
    return await parseTraceFile(traceFilePath)
  } catch {
    return []
  }
}

/**
 * Cleans up a specific trace file.
 */
export async function cleanupTraceFiles(traceFilePath: string): Promise<void> {
  await unlink(traceFilePath)
}

/**
 * Extracts the module name from a trace event name.
 * Converts "require('module-name')" to "module-name"
 */
export function extractModuleName(traceName: string): string {
  const match = traceName.match(/require\(['"](.+)['"]\)/)

  return match ? match[1] : traceName
}

/**
 * Aggregates timings by module name, summing up multiple requires of the same module.
 */
export function aggregateTimings(timings: ModuleLoadTiming[]): Map<string, number> {
  const aggregated = new Map<string, number>()

  for (const timing of timings) {
    const moduleName = extractModuleName(timing.name)
    const existing = aggregated.get(moduleName) || 0
    aggregated.set(moduleName, existing + timing.loadTimeMs)
  }

  return aggregated
}
