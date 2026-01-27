/*
|--------------------------------------------------------------------------
| Formatting Utilities
|--------------------------------------------------------------------------
|
| Shared formatting functions for report rendering.
|
*/

import pc from 'picocolors'
import { match, P } from 'ts-pattern'
import type { ModuleTiming } from '../../types.js'

/**
 * Icons for app file categories
 */
export const categoryIcons: Record<string, string> = {
  controller: '\uD83C\uDFAE',
  service: '\u2699\uFE0F',
  model: '\uD83D\uDCE6',
  middleware: '\uD83D\uDD17',
  validator: '\u2705',
  exception: '\uD83D\uDCA5',
  event: '\uD83D\uDCE1',
  listener: '\uD83D\uDC42',
  mailer: '\uD83D\uDCE7',
  policy: '\uD83D\uDD10',
  command: '\u2328\uFE0F',
  provider: '\uD83D\uDD0C',
  config: '\u2699\uFE0F',
  start: '\uD83D\uDE80',
  other: '\uD83D\uDCC4',
}

/**
 * Gets the effective load time for a module (execTime if available, otherwise loadTime)
 */
export function getEffectiveTime(module: ModuleTiming): number {
  return module.execTime ?? module.loadTime
}

/**
 * Formats a duration in milliseconds for display
 */
export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  return `${ms.toFixed(2)}ms`
}

/**
 * Colors a duration based on how slow it is
 */
export function colorDuration(ms: number): string {
  const formatted = formatDuration(ms)
  return match(ms)
    .with(
      P.when((value) => value >= 100),
      () => pc.red(formatted)
    )
    .with(
      P.when((value) => value >= 50),
      () => pc.yellow(formatted)
    )
    .with(
      P.when((value) => value >= 10),
      () => pc.cyan(formatted)
    )
    .otherwise(() => pc.green(formatted))
}

/**
 * Creates a visual bar representing the duration
 */
export function createBar(ms: number, maxMs: number, width: number = 20): string {
  const ratio = Math.min(ms / maxMs, 1)
  const filled = Math.round(ratio * width)
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)

  return match(ms)
    .with(
      P.when((value) => value >= 100),
      () => pc.red(bar)
    )
    .with(
      P.when((value) => value >= 50),
      () => pc.yellow(bar)
    )
    .with(
      P.when((value) => value >= 10),
      () => pc.cyan(bar)
    )
    .otherwise(() => pc.green(bar))
}

/**
 * Creates table styling options for cli-table3 with minimal borders
 */
export function createTableChars(leftPadding: string = '  ') {
  return {
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'left': leftPadding,
      'left-mid': '',
      'mid': '',
      'mid-mid': '',
      'right': '',
      'right-mid': '',
      'middle': ' ',
    },
    style: { 'padding-left': 0, 'padding-right': 1 },
  }
}
