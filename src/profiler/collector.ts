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

export interface PackageGroup {
  name: string
  totalTime: number
  modules: ModuleTiming[]
}

export class ProfileCollector {
  readonly #modules: ModuleTiming[]
  readonly #providers: ProviderTiming[]

  constructor(modules: ModuleTiming[] = [], providers: ProviderTiming[] = []) {
    this.#modules = modules
    this.#providers = providers
  }

  #getEffectiveTime(module: ModuleTiming): number {
    return module.loadTime
  }

  #categorizeModule(url: string): ModuleCategory {
    if (url.startsWith('node:')) return 'node'
    if (url.includes('node_modules/@adonisjs/')) return 'adonis'
    if (url.includes('node_modules/')) return 'node_modules'
    return 'user'
  }

  #categorizeAppFile(url: string): AppFileCategory {
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

  #extractPackageName(url: string): string | null {
    const match = url.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
    return match ? match[1] : null
  }

  #sortByTime(modules: ModuleTiming[]): ModuleTiming[] {
    return [...modules].sort((a, b) => this.#getEffectiveTime(b) - this.#getEffectiveTime(a))
  }

  #sumTime(modules: ModuleTiming[]): number {
    return modules.reduce((sum, m) => sum + this.#getEffectiveTime(m), 0)
  }

  groupAppFilesByCategory(): AppFileGroup[] {
    const appModules = this.#modules.filter((m) => this.#categorizeModule(m.resolvedUrl) === 'user')
    const grouped = Object.groupBy(appModules, (m) => this.#categorizeAppFile(m.resolvedUrl))

    return Object.entries(grouped)
      .filter((entry): entry is [AppFileCategory, ModuleTiming[]] => entry[1] !== undefined)
      .map(([category, files]) => ({
        category,
        displayName: categoryConfigs[category].displayName,
        files: this.#sortByTime(files),
        totalTime: this.#sumTime(files),
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
  }

  groupModulesByPackage(): PackageGroup[] {
    const grouped = Object.groupBy(
      this.#modules,
      (m) => this.#extractPackageName(m.resolvedUrl) || 'app'
    )

    return Object.entries(grouped)
      .filter((entry): entry is [string, ModuleTiming[]] => entry[1] !== undefined)
      .map(([name, mods]) => ({
        name,
        totalTime: this.#sumTime(mods),
        modules: this.#sortByTime(mods),
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
  }

  computeSummary(): ProfileSummary {
    const grouped = Object.groupBy(this.#modules, (m) => this.#categorizeModule(m.resolvedUrl))

    const userModules = grouped.user?.length ?? 0
    const nodeModules = grouped.node_modules?.length ?? 0
    const adonisModules = grouped.adonis?.length ?? 0
    const totalModuleTime = this.#sumTime(this.#modules)
    const totalProviderTime = this.#providers.reduce((sum, p) => sum + p.totalTime, 0)

    return {
      totalModules: this.#modules.length,
      userModules,
      nodeModules,
      adonisModules,
      totalModuleTime,
      totalProviderTime,
      appFileGroups: this.groupAppFilesByCategory(),
    }
  }

  filterModules(config: ResolvedConfig): ModuleTiming[] {
    return this.#modules.filter((module) => {
      if (this.#getEffectiveTime(module) < config.threshold) return false
      if (module.resolvedUrl.startsWith('node:')) return false

      if (!config.includeNodeModules) {
        const category = this.#categorizeModule(module.resolvedUrl)
        if (category === 'node_modules' || category === 'adonis') return false
      }

      return true
    })
  }

  sortByLoadTime(): ModuleTiming[] {
    return this.#sortByTime(this.#modules)
  }

  getTopSlowest(count: number): ModuleTiming[] {
    return this.sortByLoadTime().slice(0, count)
  }

  collectResults(startTime: number, endTime: number): ProfileResult {
    return {
      totalTime: endTime - startTime,
      startTime,
      endTime,
      modules: this.#modules,
      providers: this.#providers,
      summary: this.computeSummary(),
    }
  }
}
