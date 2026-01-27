/*
|--------------------------------------------------------------------------
| Package entrypoint
|--------------------------------------------------------------------------
|
| Export values from the package entrypoint as you see fit.
|
*/

export { configure } from './configure.js'

/**
 * Export types for consumers
 */
export type {
  ModuleTiming,
  ProviderTiming,
  ProfileResult,
  ProfileSummary,
  DocteurConfig,
  ResolvedConfig,
  AppFileCategory,
  AppFileGroup,
} from './src/types.js'

/**
 * Export collector utilities for advanced usage
 */
export {
  collectResults,
  computeSummary,
  filterModules,
  sortByLoadTime,
  getTopSlowest,
  groupModulesByPackage,
  groupAppFilesByCategory,
  simplifyUrl,
} from './src/profiler/collector.js'

/**
 * Export reporters for custom reporting
 */
export type { Reporter, ReportContext } from './src/profiler/reporters/base_reporter.js'
export { ConsoleReporter } from './src/profiler/reporters/console_reporter.js'
export { TuiReporter } from './src/profiler/reporters/tui_reporter.js'
export {
  categoryIcons,
  colorDuration,
  createBar,
  formatDuration,
  getEffectiveTime,
} from './src/profiler/reporters/format.js'
