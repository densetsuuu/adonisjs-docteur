/*
|--------------------------------------------------------------------------
| Console Reporter
|--------------------------------------------------------------------------
|
| Renders profiling results to the terminal using @poppinss/cliui.
|
*/

import type { AppFileGroup, ProfileResult, ResolvedConfig } from '../../types.js'
import { ProfileCollector } from '../collector.js'
import type { ReportContext, Reporter } from './base_reporter.js'
import {
  categoryIcons,
  colorDuration,
  createBar,
  formatDuration,
  getEffectiveTime,
  simplifyUrl,
  ui,
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
    ui.logger.log('')
    ui.logger.log(ui.colors.bold(ui.colors.cyan('  \uD83E\uDE7A Docteur - Cold Start Analysis')))
    ui.logger.log(ui.colors.dim('  \u2500'.repeat(25)))
    ui.logger.log('')
  }

  #printSummary(result: ProfileResult): void {
    ui.logger.log(ui.colors.bold('  \uD83D\uDCCA Summary'))
    ui.logger.log('')

    const table = ui.table()
    table
      .row([ui.colors.dim('Total boot time:'), colorDuration(result.totalTime)])
      .row([
        ui.colors.dim('Total modules loaded:'),
        ui.colors.white(result.summary.totalModules.toString()),
      ])
      .row([
        ui.colors.dim('  App modules:'),
        ui.colors.white(result.summary.userModules.toString()),
      ])
      .row([
        ui.colors.dim('  Node modules:'),
        ui.colors.white(result.summary.nodeModules.toString()),
      ])
      .row([
        ui.colors.dim('  AdonisJS modules:'),
        ui.colors.white(result.summary.adonisModules.toString()),
      ])
      .row([ui.colors.dim('Module load time:'), colorDuration(result.summary.totalModuleTime)])

    if (result.providers.length > 0) {
      table.row([
        ui.colors.dim('Provider boot time:'),
        colorDuration(result.summary.totalProviderTime),
      ])
    }

    table.render()
    ui.logger.log('')
  }

  #printSlowestModules(result: ProfileResult, config: ResolvedConfig, cwd: string): void {
    const collector = new ProfileCollector(result.modules, result.providers)
    const filtered = collector.filterModules(config)
    const slowest = new ProfileCollector(filtered).getTopSlowest(config.topModules)

    if (slowest.length === 0) {
      ui.logger.log(ui.colors.dim('  No modules found above the threshold'))
      return
    }

    const maxTime = slowest[0] ? getEffectiveTime(slowest[0]) : 1

    ui.logger.log(ui.colors.bold(`  \uD83D\uDC22 Slowest Modules (top ${config.topModules})`))
    ui.logger.log('')

    const table = ui.table()
    table
      .head([ui.colors.dim('#'), ui.colors.dim('Module'), ui.colors.dim('Time'), ui.colors.dim('')])
      .columnWidths([6, 55, 12, 35])

    slowest.forEach((module, index) => {
      const simplified = simplifyUrl(module.resolvedUrl, cwd)
      const time = getEffectiveTime(module)
      table.row([
        ui.colors.dim((index + 1).toString()),
        simplified.length > 48 ? simplified.slice(-48) : simplified,
        colorDuration(time),
        createBar(time, maxTime),
      ])
    })

    table.render()
    ui.logger.log('')
  }

  #printPackageGroups(result: ProfileResult, config: ResolvedConfig): void {
    const collector = new ProfileCollector(result.modules, result.providers)
    const filtered = collector.filterModules(config)
    const groups = new ProfileCollector(filtered).groupModulesByPackage()

    if (groups.length === 0) {
      return
    }

    const topGroups = groups.slice(0, 10)
    const maxTime = topGroups[0]?.totalTime || 1

    ui.logger.log(ui.colors.bold('  \uD83D\uDCE6 Slowest Packages'))
    ui.logger.log('')

    const table = ui.table()
    table
      .head([
        ui.colors.dim('#'),
        ui.colors.dim('Package'),
        ui.colors.dim('Modules'),
        ui.colors.dim('Total'),
        ui.colors.dim(''),
      ])
      .columnWidths([6, 38, 12, 12, 35])

    topGroups.forEach((group, index) => {
      table.row([
        ui.colors.dim((index + 1).toString()),
        group.name.length > 33 ? group.name.slice(0, 33) : group.name,
        ui.colors.dim(group.modules.length.toString()),
        colorDuration(group.totalTime),
        createBar(group.totalTime, maxTime),
      ])
    })

    table.render()
    ui.logger.log('')
  }

  #printProviders(result: ProfileResult): void {
    if (result.providers.length === 0) {
      return
    }

    const sorted = [...result.providers].sort((a, b) => b.totalTime - a.totalTime)
    const maxTime = sorted[0]?.totalTime || 1

    ui.logger.log(ui.colors.bold('  \u26A1 Provider Lifecycle Times'))
    ui.logger.log('')

    const table = ui.table()
    table
      .head([
        ui.colors.dim('#'),
        ui.colors.dim('Provider'),
        ui.colors.dim('Register'),
        ui.colors.dim('Boot'),
        ui.colors.dim('Total'),
        ui.colors.dim(''),
      ])
      .columnWidths([5, 28, 11, 11, 11, 25])

    sorted.forEach((provider, index) => {
      table.row([
        ui.colors.dim((index + 1).toString()),
        provider.name.length > 26 ? provider.name.slice(0, 26) : provider.name,
        colorDuration(provider.registerTime),
        colorDuration(provider.bootTime),
        colorDuration(provider.totalTime),
        createBar(provider.totalTime, maxTime, 22),
      ])
    })

    table.render()
    ui.logger.log('')
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

    const collector = new ProfileCollector(result.modules, result.providers)
    const filtered = collector.filterModules(config)
    const verySlowModules = filtered.filter((m) => getEffectiveTime(m) > 100)
    if (verySlowModules.length > 0) {
      recommendations.push(
        `${verySlowModules.length} module(s) took over 100ms to load. Check for heavy initialization code.`
      )
    }

    if (recommendations.length === 0) {
      ui.logger.log(ui.colors.bold('  \u2705 ') + ui.colors.green('No major issues detected!'))
    } else {
      ui.logger.log(ui.colors.bold('  \uD83D\uDCA1 Recommendations'))
      ui.logger.log('')
      recommendations.forEach((rec) => {
        ui.logger.log(`  ${ui.colors.yellow('\u2022')} ${rec}`)
      })
    }

    ui.logger.log('')
  }

  #printAppFiles(result: ProfileResult, cwd: string): void {
    const groups = result.summary.appFileGroups

    if (groups.length === 0) {
      return
    }

    ui.logger.log(ui.colors.bold('  \uD83D\uDCC1 App Files by Category'))
    ui.logger.log('')

    for (const group of groups) {
      if (group.files.length === 0) continue

      const icon = categoryIcons[group.category] || ''
      const header = `  ${icon} ${group.displayName} (${group.files.length} files, ${formatDuration(group.totalTime)})`
      ui.logger.log(ui.colors.bold(ui.colors.white(header)))

      this.#printAppFileGroup(group, cwd)
      ui.logger.log('')
    }
  }

  #printAppFileGroup(group: AppFileGroup, cwd: string): void {
    const maxTime = group.files[0] ? getEffectiveTime(group.files[0]) : 1

    const table = ui.table()
    table.columnWidths([45, 12, 35])

    for (const file of group.files) {
      const simplified = simplifyUrl(file.resolvedUrl, cwd)
      const fileName = simplified.split('/').pop() || simplified
      const time = getEffectiveTime(file)
      table.row([
        fileName.length > 43 ? fileName.slice(-43) : fileName,
        colorDuration(time),
        createBar(time, maxTime),
      ])
    }

    table.render()
  }

  #printFooter(): void {
    ui.logger.log(ui.colors.dim('  \u2500'.repeat(25)))
    ui.logger.log(ui.colors.dim('  Run with --help for more options'))
    ui.logger.log('')
  }
}
