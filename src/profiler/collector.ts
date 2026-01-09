import { match } from 'ts-pattern'

import type {
  AppFileCategory,
  AppFileGroup,
  ModuleTiming,
  ProfileResult,
  ProfileSummary,
  ProviderTiming,
  ResolvedConfig,
} from '../types.js'

type ModuleCategory = 'node' | 'adonis' | 'node_modules' | 'user'

function getEffectiveTime(module: ModuleTiming): number {
  return module.execTime ?? module.loadTime
}

interface CategoryConfig {
  displayName: string
  patterns: string[]
}

const categoryConfigs: Record<AppFileCategory, CategoryConfig> = {
  controller: { displayName: 'Controllers', patterns: ['/controllers/', '_controller.'] },
  service: { displayName: 'Services', patterns: ['/services/', '_service.'] },
  model: { displayName: 'Models', patterns: ['/models/', '/model/'] },
  middleware: { displayName: 'Middleware', patterns: ['/middleware/', '_middleware.'] },
  validator: { displayName: 'Validators', patterns: ['/validators/', '_validator.'] },
  exception: { displayName: 'Exceptions', patterns: ['/exceptions/', '_exception.'] },
  event: { displayName: 'Events', patterns: ['/events/', '_event.'] },
  listener: { displayName: 'Listeners', patterns: ['/listeners/', '_listener.'] },
  mailer: { displayName: 'Mailers', patterns: ['/mailers/', '_mailer.'] },
  policy: { displayName: 'Policies', patterns: ['/policies/', '_policy.'] },
  command: { displayName: 'Commands', patterns: ['/commands/', '_command.'] },
  provider: { displayName: 'Providers', patterns: ['/providers/', '_provider.'] },
  config: { displayName: 'Config', patterns: ['/config/'] },
  start: { displayName: 'Start Files', patterns: ['/start/'] },
  other: { displayName: 'Other', patterns: [] },
}

function categorizeModule(url: string): ModuleCategory {
  if (url.startsWith('node:')) return 'node'
  if (url.includes('node_modules/@adonisjs/')) return 'adonis'
  if (url.includes('node_modules/')) return 'node_modules'

  return 'user'
}

function categorizeAppFile(url: string): AppFileCategory {
  const path = url.toLowerCase()

  for (const [category, config] of Object.entries(categoryConfigs) as [
    AppFileCategory,
    CategoryConfig,
  ][]) {
    if (config.patterns.some((pattern) => path.includes(pattern))) {
      return category
    }
  }

  return 'other'
}

export function groupAppFilesByCategory(modules: ModuleTiming[]): AppFileGroup[] {
  const groups = new Map<AppFileCategory, ModuleTiming[]>()
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
      displayName: categoryConfigs[category].displayName,
      files: files.sort((a, b) => getEffectiveTime(b) - getEffectiveTime(a)),
      totalTime: files.reduce((sum, f) => sum + getEffectiveTime(f), 0),
    }))
    .sort((a, b) => b.totalTime - a.totalTime)
}

function extractPackageName(url: string): string | null {
  const packageMatch = url.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)

  return packageMatch ? packageMatch[1] : null
}

export interface PackageGroup {
  name: string
  totalTime: number
  modules: ModuleTiming[]
}

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
      totalTime: mods.reduce((sum, m) => sum + getEffectiveTime(m), 0),
      modules: mods.sort((a, b) => getEffectiveTime(b) - getEffectiveTime(a)),
    }))
    .sort((a, b) => b.totalTime - a.totalTime)
}

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
    totalModuleTime += getEffectiveTime(module)

    match(category)
      .with('user', () => userModules++)
      .with('node_modules', () => nodeModules++)
      .with('adonis', () => adonisModules++)
      .otherwise(() => {})
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

export function filterModules(modules: ModuleTiming[], config: ResolvedConfig): ModuleTiming[] {
  return modules.filter((module) => {
    if (getEffectiveTime(module) < config.threshold) return false
    if (module.resolvedUrl.startsWith('node:')) return false

    if (!config.includeNodeModules) {
      const category = categorizeModule(module.resolvedUrl)
      if (category === 'node_modules' || category === 'adonis') return false
    }

    return true
  })
}

export function sortByLoadTime(modules: ModuleTiming[]): ModuleTiming[] {
  return [...modules].sort((a, b) => getEffectiveTime(b) - getEffectiveTime(a))
}

export function getTopSlowest(modules: ModuleTiming[], count: number): ModuleTiming[] {
  return sortByLoadTime(modules).slice(0, count)
}

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

export function simplifyUrl(url: string, cwd: string): string {
  let simplified = url.replace(/^file:\/\//, '')

  if (simplified.startsWith(cwd)) {
    simplified = '.' + simplified.slice(cwd.length)
  }

  const nodeModulesMatch = simplified.match(/node_modules\/(.+)/)
  if (nodeModulesMatch) {
    simplified = nodeModulesMatch[1]
  }

  return simplified
}
