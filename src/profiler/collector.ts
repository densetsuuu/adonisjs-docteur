/*
|--------------------------------------------------------------------------
| Data Collector
|--------------------------------------------------------------------------
|
| Aggregates and processes timing data from the profiler.
|
*/

import type {
  AppFileCategory,
  AppFileGroup,
  ModuleTiming,
  ProfileResult,
  ProfileSummary,
  ProviderTiming,
  ResolvedConfig,
} from '../types.js'

/**
 * Categorizes a module based on its URL
 */
function categorizeModule(url: string) {
  if (url.startsWith('node:')) {
    return 'node'
  }
  if (url.includes('node_modules/@adonisjs/')) {
    return 'adonis'
  }
  if (url.includes('node_modules/')) {
    return 'node_modules'
  }
  return 'user'
}

/**
 * Display names for app file categories
 */
const categoryDisplayNames: Record<AppFileCategory, string> = {
  controller: 'Controllers',
  service: 'Services',
  model: 'Models',
  middleware: 'Middleware',
  validator: 'Validators',
  exception: 'Exceptions',
  event: 'Events',
  listener: 'Listeners',
  mailer: 'Mailers',
  policy: 'Policies',
  command: 'Commands',
  provider: 'Providers',
  config: 'Config',
  start: 'Start Files',
  other: 'Other',
}

/**
 * Categorizes an app file based on its path
 */
function categorizeAppFile(url: string): AppFileCategory {
  const path = url.toLowerCase()

  // Check for common AdonisJS directory patterns
  if (path.includes('/controllers/') || path.includes('_controller.')) {
    return 'controller'
  }
  if (path.includes('/services/') || path.includes('_service.')) {
    return 'service'
  }
  if (path.includes('/models/') || path.includes('/model/')) {
    return 'model'
  }
  if (path.includes('/middleware/') || path.includes('_middleware.')) {
    return 'middleware'
  }
  if (path.includes('/validators/') || path.includes('_validator.')) {
    return 'validator'
  }
  if (path.includes('/exceptions/') || path.includes('_exception.')) {
    return 'exception'
  }
  if (path.includes('/events/') || path.includes('_event.')) {
    return 'event'
  }
  if (path.includes('/listeners/') || path.includes('_listener.')) {
    return 'listener'
  }
  if (path.includes('/mailers/') || path.includes('_mailer.')) {
    return 'mailer'
  }
  if (path.includes('/policies/') || path.includes('_policy.')) {
    return 'policy'
  }
  if (path.includes('/commands/') || path.includes('_command.')) {
    return 'command'
  }
  if (path.includes('/providers/') || path.includes('_provider.')) {
    return 'provider'
  }
  if (path.includes('/config/')) {
    return 'config'
  }
  if (path.includes('/start/')) {
    return 'start'
  }

  return 'other'
}

/**
 * Groups app files by their category
 */
export function groupAppFilesByCategory(modules: ModuleTiming[]): AppFileGroup[] {
  const groups = new Map<AppFileCategory, ModuleTiming[]>()

  // Filter to only user modules (app files)
  const appModules = modules.filter((m) => categorizeModule(m.resolvedUrl) === 'user')

  for (const module of appModules) {
    const category = categorizeAppFile(module.resolvedUrl)
    const existing = groups.get(category) || []
    existing.push(module)
    groups.set(category, existing)
  }

  return Array.from(groups.entries())
    .map(([category, files]) => ({
      category,
      displayName: categoryDisplayNames[category],
      files: files.sort((a, b) => b.loadTime - a.loadTime),
      totalTime: files.reduce((sum, f) => sum + f.loadTime, 0),
    }))
    .sort((a, b) => b.totalTime - a.totalTime)
}

/**
 * Extracts the package name from a node_modules path
 */
function extractPackageName(url: string): string | null {
  const match = url.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
  return match ? match[1] : null
}

/**
 * Groups modules by package name
 */
export interface PackageGroup {
  name: string
  totalTime: number
  modules: ModuleTiming[]
}

/**
 * Groups modules by their package name
 */
export function groupModulesByPackage(modules: ModuleTiming[]): PackageGroup[] {
  const groups = new Map<string, ModuleTiming[]>()

  for (const module of modules) {
    const packageName = extractPackageName(module.resolvedUrl) || 'app'
    const existing = groups.get(packageName) || []
    existing.push(module)
    groups.set(packageName, existing)
  }

  return Array.from(groups.entries())
    .map(([name, mods]) => ({
      name,
      totalTime: mods.reduce((sum, m) => sum + m.loadTime, 0),
      modules: mods.sort((a, b) => b.loadTime - a.loadTime),
    }))
    .sort((a, b) => b.totalTime - a.totalTime)
}

/**
 * Computes summary statistics from module timings
 */
export function computeSummary(
  modules: ModuleTiming[],
  providers: ProviderTiming[]
): ProfileSummary {
  let userModules = 0
  let nodeModules = 0
  let adonisModules = 0
  let totalModuleTime = 0

  for (const module of modules) {
    const category = categorizeModule(module.resolvedUrl)
    totalModuleTime += module.loadTime

    switch (category) {
      case 'user':
        userModules++
        break
      case 'node_modules':
        nodeModules++
        break
      case 'adonis':
        adonisModules++
        break
    }
  }

  const totalProviderTime = providers.reduce((sum, p) => sum + p.totalTime, 0)
  const appFileGroups = groupAppFilesByCategory(modules)

  return {
    totalModules: modules.length,
    userModules,
    nodeModules,
    adonisModules,
    totalModuleTime,
    totalProviderTime,
    appFileGroups,
  }
}

/**
 * Filters modules based on configuration
 */
export function filterModules(modules: ModuleTiming[], config: ResolvedConfig): ModuleTiming[] {
  return modules.filter((module) => {
    // Filter by threshold
    if (module.loadTime < config.threshold) {
      return false
    }

    // Filter node_modules if not included
    if (!config.includeNodeModules) {
      const category = categorizeModule(module.resolvedUrl)
      if (category === 'node_modules' || category === 'adonis') {
        return false
      }
    }

    // Skip node: built-ins (they're always fast)
    if (module.resolvedUrl.startsWith('node:')) {
      return false
    }

    return true
  })
}

/**
 * Sorts modules by load time (slowest first)
 */
export function sortByLoadTime(modules: ModuleTiming[]): ModuleTiming[] {
  return [...modules].sort((a, b) => b.loadTime - a.loadTime)
}

/**
 * Gets the top N slowest modules
 */
export function getTopSlowest(modules: ModuleTiming[], count: number): ModuleTiming[] {
  return sortByLoadTime(modules).slice(0, count)
}

/**
 * Collects and processes all profiling data
 */
export function collectResults(
  modules: ModuleTiming[],
  providers: ProviderTiming[],
  startTime: number,
  endTime: number
): ProfileResult {
  const totalTime = endTime - startTime
  const summary = computeSummary(modules, providers)

  return {
    totalTime,
    startTime,
    endTime,
    modules,
    providers,
    summary,
  }
}

/**
 * Simplifies a module URL for display
 */
export function simplifyUrl(url: string, cwd: string): string {
  // Remove file:// prefix
  let simplified = url.replace(/^file:\/\//, '')

  // Make path relative to cwd
  if (simplified.startsWith(cwd)) {
    simplified = '.' + simplified.slice(cwd.length)
  }

  // Shorten node_modules paths
  const nodeModulesMatch = simplified.match(/node_modules\/(.+)/)
  if (nodeModulesMatch) {
    simplified = nodeModulesMatch[1]
  }

  return simplified
}
