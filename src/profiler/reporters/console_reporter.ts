/*
|--------------------------------------------------------------------------
| Console Reporter
|--------------------------------------------------------------------------
|
| Renders profiling results to the terminal using cli-table3.
|
*/

import Table from 'cli-table3'
import pc from 'picocolors'
import type { AppFileGroup, ProfileResult, ResolvedConfig } from '../../types.js'
import { filterModules, getTopSlowest, groupModulesByPackage, simplifyUrl } from '../collector.js'
import type { Reporter, ReportContext } from './base_reporter.js'
import {
  categoryIcons,
  colorDuration,
  createBar,
  createTableChars,
  formatDuration,
  getEffectiveTime,
} from './format.js'

export class ConsoleReporter implements Reporter {
  /**
   * Renders the complete report to console.
   */
  render(context: ReportContext): void {
    const { result, config, cwd } = context

    this.#printHeader()
    this.#printSummary(result)
    this.#printAppFiles(result, cwd)
    this.#printSlowestModules(result, config, cwd)

    if (config.groupByPackage) {
      this.#printPackageGroups(result, config)
    }

    this.#printProviders(result)
    this.#printRecommendations(result, config)
    this.#printFooter()
  }

  #printHeader(): void {
    console.log()
    console.log(pc.bold(pc.cyan('  \uD83E\uDE7A Docteur - Cold Start Analysis')))
    console.log(pc.dim('  \u2500'.repeat(25)))
    console.log()
  }

  #printSummary(result: ProfileResult): void {
    console.log(pc.bold('  \uD83D\uDCCA Summary'))
    console.log()

    const table = new Table({
      ...createTableChars(),
      style: { 'padding-left': 0, 'padding-right': 2 },
    })

    table.push(
      [pc.dim('Total boot time:'), colorDuration(result.totalTime)],
      [pc.dim('Total modules loaded:'), pc.white(result.summary.totalModules.toString())],
      [pc.dim('  App modules:'), pc.white(result.summary.userModules.toString())],
      [pc.dim('  Node modules:'), pc.white(result.summary.nodeModules.toString())],
      [pc.dim('  AdonisJS modules:'), pc.white(result.summary.adonisModules.toString())],
      [pc.dim('Module load time:'), colorDuration(result.summary.totalModuleTime)]
    )

    if (result.providers.length > 0) {
      table.push([pc.dim('Provider boot time:'), colorDuration(result.summary.totalProviderTime)])
    }

    console.log(table.toString())
    console.log()
  }

  #printSlowestModules(result: ProfileResult, config: ResolvedConfig, cwd: string): void {
    const filtered = filterModules(result.modules, config)
    const slowest = getTopSlowest(filtered, config.topModules)

    if (slowest.length === 0) {
      console.log(pc.dim('  No modules found above the threshold'))
      return
    }

    const maxTime = slowest[0] ? getEffectiveTime(slowest[0]) : 1

    console.log(pc.bold(`  \uD83D\uDC22 Slowest Modules (top ${config.topModules})`))
    console.log()

    const table = new Table({
      head: [pc.dim('#'), pc.dim('Module'), pc.dim('Time'), pc.dim('')],
      ...createTableChars(),
      style: { 'padding-left': 0, 'padding-right': 1, 'head': [] },
      colWidths: [4, 50, 12, 22],
      wordWrap: true,
    })

    slowest.forEach((module, index) => {
      const simplified = simplifyUrl(module.resolvedUrl, cwd)
      const time = getEffectiveTime(module)
      table.push([
        pc.dim((index + 1).toString()),
        simplified.length > 48 ? simplified.slice(-48) : simplified,
        colorDuration(time),
        createBar(time, maxTime),
      ])
    })

    console.log(table.toString())
    console.log()
  }

  #printPackageGroups(result: ProfileResult, config: ResolvedConfig): void {
    const filtered = filterModules(result.modules, config)
    const groups = groupModulesByPackage(filtered)

    if (groups.length === 0) {
      return
    }

    const topGroups = groups.slice(0, 10)
    const maxTime = topGroups[0]?.totalTime || 1

    console.log(pc.bold('  \uD83D\uDCE6 Slowest Packages'))
    console.log()

    const table = new Table({
      head: [pc.dim('#'), pc.dim('Package'), pc.dim('Modules'), pc.dim('Total'), pc.dim('')],
      ...createTableChars(),
      style: { 'padding-left': 0, 'padding-right': 1, 'head': [] },
      colWidths: [4, 35, 9, 12, 22],
    })

    topGroups.forEach((group, index) => {
      table.push([
        pc.dim((index + 1).toString()),
        group.name.length > 33 ? group.name.slice(0, 33) : group.name,
        pc.dim(group.modules.length.toString()),
        colorDuration(group.totalTime),
        createBar(group.totalTime, maxTime),
      ])
    })

    console.log(table.toString())
    console.log()
  }

  #printProviders(result: ProfileResult): void {
    if (result.providers.length === 0) {
      return
    }

    const sorted = [...result.providers].sort((a, b) => b.totalTime - a.totalTime)
    const maxTime = sorted[0]?.totalTime || 1

    console.log(pc.bold('  \u26A1 Provider Boot Times'))
    console.log()

    const table = new Table({
      head: [pc.dim('#'), pc.dim('Provider'), pc.dim('Register'), pc.dim('Boot'), pc.dim('')],
      ...createTableChars(),
      style: { 'padding-left': 0, 'padding-right': 1, 'head': [] },
      colWidths: [4, 35, 12, 12, 22],
    })

    sorted.forEach((provider, index) => {
      table.push([
        pc.dim((index + 1).toString()),
        provider.name,
        colorDuration(provider.registerTime),
        colorDuration(provider.bootTime),
        createBar(provider.totalTime, maxTime),
      ])
    })

    console.log(table.toString())
    console.log()
  }

  #printRecommendations(result: ProfileResult, config: ResolvedConfig): void {
    const recommendations: string[] = []

    if (result.totalTime > 2000) {
      recommendations.push('Total boot time is over 2s. Consider lazy-loading some providers.')
    }

    if (result.summary.totalModules > 500) {
      recommendations.push(
        `Loading ${result.summary.totalModules} modules. Consider code splitting or lazy imports.`
      )
    }

    const filtered = filterModules(result.modules, config)
    const verySlowModules = filtered.filter((m) => getEffectiveTime(m) > 100)
    if (verySlowModules.length > 0) {
      recommendations.push(
        `${verySlowModules.length} module(s) took over 100ms to load. Check for heavy initialization code.`
      )
    }

    if (recommendations.length === 0) {
      console.log(pc.bold('  \u2705 ') + pc.green('No major issues detected!'))
    } else {
      console.log(pc.bold('  \uD83D\uDCA1 Recommendations'))
      console.log()
      recommendations.forEach((rec) => {
        console.log(`  ${pc.yellow('\u2022')} ${rec}`)
      })
    }

    console.log()
  }

  #printAppFiles(result: ProfileResult, cwd: string): void {
    const groups = result.summary.appFileGroups

    if (groups.length === 0) {
      return
    }

    console.log(pc.bold('  \uD83D\uDCC1 App Files by Category'))
    console.log()

    for (const group of groups) {
      if (group.files.length === 0) continue

      const icon = categoryIcons[group.category] || ''
      const header = `  ${icon} ${group.displayName} (${group.files.length} files, ${formatDuration(group.totalTime)})`
      console.log(pc.bold(pc.white(header)))

      this.#printAppFileGroup(group, cwd)
      console.log()
    }
  }

  #printAppFileGroup(group: AppFileGroup, cwd: string): void {
    const maxTime = group.files[0] ? getEffectiveTime(group.files[0]) : 1

    const table = new Table({
      ...createTableChars('    '),
      colWidths: [45, 12, 22],
    })

    for (const file of group.files) {
      const simplified = simplifyUrl(file.resolvedUrl, cwd)
      const fileName = simplified.split('/').pop() || simplified
      const time = getEffectiveTime(file)
      table.push([
        fileName.length > 43 ? fileName.slice(-43) : fileName,
        colorDuration(time),
        createBar(time, maxTime),
      ])
    }

    console.log(table.toString())
  }

  #printFooter(): void {
    console.log(pc.dim('  \u2500'.repeat(25)))
    console.log(pc.dim('  Run with --help for more options'))
    console.log()
  }
}
