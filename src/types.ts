/*
|--------------------------------------------------------------------------
| Docteur Types
|--------------------------------------------------------------------------
|
| Type definitions for the Docteur profiler package.
|
*/

/**
 * Timing information for a single module import
 */
export interface ModuleTiming {
  /**
   * The original import specifier (e.g., '@adonisjs/core', './app/services/user.js')
   */
  specifier: string

  /**
   * The fully resolved URL of the module
   */
  resolvedUrl: string

  /**
   * Time in milliseconds to load and evaluate the module
   */
  loadTime: number

  /**
   * Time in milliseconds to resolve the module specifier
   */
  resolveTime: number

  /**
   * The URL of the parent module that imported this one
   */
  parentUrl?: string

  /**
   * Timestamp when the module started loading
   */
  startTime: number

  /**
   * Timestamp when the module finished loading
   */
  endTime: number
}

/**
 * Timing information for an AdonisJS provider
 */
export interface ProviderTiming {
  /**
   * Name of the provider class
   */
  name: string

  /**
   * Time in milliseconds for the register phase
   */
  registerTime: number

  /**
   * Time in milliseconds for the boot phase
   */
  bootTime: number

  /**
   * Total time (register + boot)
   */
  totalTime: number
}

/**
 * Complete profiling results
 */
export interface ProfileResult {
  /**
   * Total cold start time in milliseconds
   */
  totalTime: number

  /**
   * Timestamp when profiling started
   */
  startTime: number

  /**
   * Timestamp when profiling ended
   */
  endTime: number

  /**
   * All module timing data
   */
  modules: ModuleTiming[]

  /**
   * Provider timing data
   */
  providers: ProviderTiming[]

  /**
   * Summary statistics
   */
  summary: ProfileSummary
}

/**
 * Summary statistics for the profile
 */
export interface ProfileSummary {
  /**
   * Total number of modules loaded
   */
  totalModules: number

  /**
   * Number of user modules (from the app directory)
   */
  userModules: number

  /**
   * Number of node_modules dependencies
   */
  nodeModules: number

  /**
   * Number of AdonisJS core modules
   */
  adonisModules: number

  /**
   * Total time spent loading modules
   */
  totalModuleTime: number

  /**
   * Total time spent in provider lifecycle
   */
  totalProviderTime: number
}

/**
 * Configuration options for Docteur
 */
export interface DocteurConfig {
  /**
   * Number of slowest modules to display in the report
   * @default 20
   */
  topModules: number

  /**
   * Only show modules that took longer than this threshold (in ms)
   * @default 1
   */
  threshold: number

  /**
   * Include node_modules in the analysis
   * @default true
   */
  includeNodeModules: boolean

  /**
   * Group modules by package name
   * @default true
   */
  groupByPackage: boolean
}

/**
 * IPC message types for communication between processes
 */
export type IpcMessage =
  | { type: 'module'; data: ModuleTiming }
  | { type: 'provider'; data: ProviderTiming }
  | { type: 'ready'; data: { totalTime: number } }
  | { type: 'error'; data: { message: string; stack?: string } }

/**
 * Global store for collecting timing data
 */
export interface TimingStore {
  modules: Map<string, ModuleTiming>
  providers: ProviderTiming[]
  startTime: number
}

/**
 * Resolved configuration with defaults applied
 */
export type ResolvedConfig = Required<DocteurConfig>
