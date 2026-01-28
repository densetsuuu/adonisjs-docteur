/*
|--------------------------------------------------------------------------
| Profile Collector
|--------------------------------------------------------------------------
|
| Collects and analyzes module timing data. Computes subtree times
| (cascading impact including dependencies) and groups modules by
| category or package.
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
import { categories } from './registries/index.js'

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

    // Compute subtree times if not already done (skip after filtering to avoid incomplete graph)
    if (modules.length > 0 && modules[0].subtreeTime === undefined) {
      this.#populateSubtreeTimes()
    }
  }

  #populateSubtreeTimes(): void {
    const byUrl = new Map(this.#modules.map((m) => [m.resolvedUrl, m]))
    const children = new Map<string, string[]>()

    for (const m of this.#modules) {
      if (m.parentUrl) {
        const list = children.get(m.parentUrl) || []
        list.push(m.resolvedUrl)
        children.set(m.parentUrl, list)
      }
    }

    const compute = (url: string, seen: Set<string>): number => {
      if (seen.has(url)) return 0
      seen.add(url)

      const mod = byUrl.get(url)
      if (!mod) return 0

      let total = mod.loadTime
      for (const child of children.get(url) || []) {
        total += compute(child, seen)
      }
      return total
    }

    for (const m of this.#modules) {
      m.subtreeTime = compute(m.resolvedUrl, new Set())
    }
  }

  #time(m: ModuleTiming): number {
    return m.subtreeTime ?? m.loadTime
  }

  #sumTime(modules: ModuleTiming[]): number {
    return modules.reduce((sum, m) => sum + this.#time(m), 0)
  }

  #sortByTime(modules: ModuleTiming[]): ModuleTiming[] {
    return [...modules].sort((a, b) => this.#time(b) - this.#time(a))
  }

  #moduleCategory(url: string): 'node' | 'adonis' | 'node_modules' | 'user' {
    if (url.startsWith('node:')) return 'node'
    if (url.includes('node_modules/@adonisjs/')) return 'adonis'
    if (url.includes('node_modules/')) return 'node_modules'
    return 'user'
  }

  #appFileCategory(url: string): AppFileCategory {
    const path = url.toLowerCase()
    for (const [cat, def] of Object.entries(categories)) {
      if (def.patterns.some((p) => path.includes(p))) {
        return cat as AppFileCategory
      }
    }
    return 'other'
  }

  #packageName(url: string): string {
    const match = url.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
    return match?.[1] || 'app'
  }

  groupAppFilesByCategory(): AppFileGroup[] {
    const userModules = this.#modules.filter((m) => this.#moduleCategory(m.resolvedUrl) === 'user')
    const grouped = Object.groupBy(userModules, (m) => this.#appFileCategory(m.resolvedUrl))

    return Object.entries(grouped)
      .filter((e): e is [AppFileCategory, ModuleTiming[]] => e[1] !== undefined)
      .map(([category, files]) => ({
        category,
        displayName: categories[category].displayName,
        files: this.#sortByTime(files),
        totalTime: this.#sumTime(files),
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
  }

  groupModulesByPackage(): PackageGroup[] {
    const grouped = Object.groupBy(this.#modules, (m) => this.#packageName(m.resolvedUrl))

    return Object.entries(grouped)
      .filter((e): e is [string, ModuleTiming[]] => e[1] !== undefined)
      .map(([name, mods]) => ({
        name,
        totalTime: this.#sumTime(mods),
        modules: this.#sortByTime(mods),
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
  }

  computeSummary(): ProfileSummary {
    const grouped = Object.groupBy(this.#modules, (m) => this.#moduleCategory(m.resolvedUrl))

    return {
      totalModules: this.#modules.length,
      userModules: grouped.user?.length ?? 0,
      nodeModules: grouped.node_modules?.length ?? 0,
      adonisModules: grouped.adonis?.length ?? 0,
      totalModuleTime: this.#sumTime(this.#modules),
      totalProviderTime: this.#providers.reduce((sum, p) => sum + p.totalTime, 0),
      appFileGroups: this.groupAppFilesByCategory(),
    }
  }

  filterModules(config: ResolvedConfig): ModuleTiming[] {
    return this.#modules.filter((m) => {
      if (this.#time(m) < config.threshold) return false
      if (m.resolvedUrl.startsWith('node:')) return false

      if (!config.includeNodeModules) {
        const cat = this.#moduleCategory(m.resolvedUrl)
        if (cat === 'node_modules' || cat === 'adonis') return false
      }

      return true
    })
  }

  getTopSlowest(count: number): ModuleTiming[] {
    return this.#sortByTime(this.#modules).slice(0, count)
  }

  collectResults(totalTime: number): ProfileResult {
    return {
      totalTime,
      modules: this.#modules,
      providers: this.#providers,
      summary: this.computeSummary(),
    }
  }
}
