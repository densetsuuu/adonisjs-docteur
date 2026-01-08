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
  simplifyUrl,
} from './src/profiler/collector.js'

/**
 * Export reporter for custom reporting
 */
export {
  printReport,
  printHeader,
  printSummary,
  printSlowestModules,
  printPackageGroups,
  printProviders,
  printRecommendations,
  printFooter,
} from './src/profiler/reporter.js'
