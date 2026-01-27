/*
|--------------------------------------------------------------------------
| Reporter Types
|--------------------------------------------------------------------------
|
| Type definitions for the reporter strategy pattern.
|
*/

import type { ProfileResult, ResolvedConfig } from '../../types.js'

/**
 * Context passed to reporters containing all data needed for rendering.
 */
export interface ReportContext {
  result: ProfileResult
  config: ResolvedConfig
  cwd: string
}

/**
 * Strategy interface for rendering profile reports.
 * Implementations can render to console, TUI, file, etc.
 */
export interface Reporter {
  /**
   * Renders the complete report using the provided context.
   */
  render(context: ReportContext): void | Promise<void>
}
