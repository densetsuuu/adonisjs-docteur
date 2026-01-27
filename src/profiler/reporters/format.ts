/*
|--------------------------------------------------------------------------
| Formatting Utilities
|--------------------------------------------------------------------------
|
| Shared formatting functions for report rendering.
|
*/

import { cliui } from '@poppinss/cliui'
import type { ModuleTiming } from '../../types.js'

/**
 * Shared UI instance for consistent styling
 */
export const ui = cliui()

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
 * Gets the load time for a module
 */
export function getEffectiveTime(module: ModuleTiming): number {
  return module.loadTime
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
  if (ms >= 100) return ui.colors.red(formatted)
  if (ms >= 50) return ui.colors.yellow(formatted)
  if (ms >= 10) return ui.colors.cyan(formatted)
  return ui.colors.green(formatted)
}

/**
 * Creates a visual bar representing the duration
 */
export function createBar(ms: number, maxMs: number, width: number = 30): string {
  const ratio = Math.min(ms / maxMs, 1)
  const filled = Math.round(ratio * width)
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)

  if (ms >= 100) return ui.colors.red(bar)
  if (ms >= 50) return ui.colors.yellow(bar)
  if (ms >= 10) return ui.colors.cyan(bar)
  return ui.colors.green(bar)
}

/**
 * Simplifies a module URL for display:
 * - Strips file:// protocol
 * - Converts absolute paths to relative (using cwd)
 * - For node_modules, shows only the package path
 */
export function simplifyUrl(url: string, cwd: string): string {
  const withoutProtocol = url.replace(/^file:\/\//, '')

  const nodeModulesIndex = withoutProtocol.indexOf('node_modules/')
  if (nodeModulesIndex !== -1) {
    return withoutProtocol.slice(nodeModulesIndex + 'node_modules/'.length)
  }

  if (withoutProtocol.startsWith(cwd)) {
    return '.' + withoutProtocol.slice(cwd.length)
  }

  return withoutProtocol
}
