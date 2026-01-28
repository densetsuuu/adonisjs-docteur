/*
|--------------------------------------------------------------------------
| Formatting Utilities
|--------------------------------------------------------------------------
|
| Shared formatting functions for report rendering.
|
*/

import { cliui } from '@poppinss/cliui'
import type { AppFileCategory, ModuleTiming } from '../../types.js'
import { categories, symbols } from '../registries/index.js'

/**
 * Shared UI instance for consistent styling
 */
export const ui = cliui()

/**
 * Get icon for a category
 */
export function getCategoryIcon(category: AppFileCategory): string {
  return categories[category].icon
}

/**
 * Gets the effective time for a module.
 * Uses subtreeTime (total including dependencies) if available,
 * otherwise falls back to loadTime.
 */
export function getEffectiveTime(module: ModuleTiming): number {
  return module.subtreeTime ?? module.loadTime
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
  const bar = symbols.barFull.repeat(filled) + symbols.barEmpty.repeat(width - filled)

  if (ms >= 100) return ui.colors.red(bar)
  if (ms >= 50) return ui.colors.yellow(bar)
  if (ms >= 10) return ui.colors.cyan(bar)
  return ui.colors.green(bar)
}

/**
 * Simplifies a module URL for display:
 * - Strips file:// protocol
 * - Converts absolute paths to relative (using cwd)
 * - For node_modules, shows only the package path (handles pnpm store)
 */
export function simplifyUrl(url: string, cwd: string): string {
  const withoutProtocol = url.replace(/^file:\/\//, '')

  // Use lastIndexOf to handle pnpm store paths like:
  // .pnpm/@pkg@version/node_modules/@scope/pkg/index.js
  const nodeModulesIndex = withoutProtocol.lastIndexOf('node_modules/')
  if (nodeModulesIndex !== -1) {
    return withoutProtocol.slice(nodeModulesIndex + 'node_modules/'.length)
  }

  if (withoutProtocol.startsWith(cwd)) {
    return '.' + withoutProtocol.slice(cwd.length)
  }

  return withoutProtocol
}
