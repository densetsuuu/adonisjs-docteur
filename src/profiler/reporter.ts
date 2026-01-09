/*
|--------------------------------------------------------------------------
| Terminal Reporter
|--------------------------------------------------------------------------
|
| Formats and displays profiling results in the terminal.
|
*/

import Table from 'cli-table3'
import pc from 'picocolors'
import type { AppFileGroup, ProfileResult, ResolvedConfig } from '../types.js'
import { filterModules, getTopSlowest, groupModulesByPackage, simplifyUrl } from './collector.js'

/**
 * Icons for app file categories
 */
const categoryIcons: Record<string, string> = {
  controller: '🎮',
  service: '⚙️',
  model: '📦',
  middleware: '🔗',
  validator: '✅',
  exception: '💥',
  event: '📡',
  listener: '👂',
  mailer: '📧',
  policy: '🔐',
  command: '⌨️',
  provider: '🔌',
  config: '⚙️',
  start: '🚀',
  other: '📄',
}

/**
 * Formats a duration in milliseconds for display
 */
function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  return `${ms.toFixed(2)}ms`
}

/**
 * Colors a duration based on how slow it is
 */
function colorDuration(ms: number): string {
  const formatted = formatDuration(ms)
  if (ms >= 100) {
    return pc.red(formatted)
  }
  if (ms >= 50) {
    return pc.yellow(formatted)
  }
  if (ms >= 10) {
    return pc.cyan(formatted)
  }
  return pc.green(formatted)
}

/**
 * Creates a visual bar representing the duration
 */
function createBar(ms: number, maxMs: number, width: number = 20): string {
  const ratio = Math.min(ms / maxMs, 1)
  const filled = Math.round(ratio * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)

  if (ms >= 100) {
    return pc.red(bar)
  }
  if (ms >= 50) {
    return pc.yellow(bar)
  }
  return pc.green(bar)
}

/**
 * Prints the header banner
 */
export function printHeader(): void {
  console.log()
  console.log(pc.bold(pc.cyan('  🩺 Docteur - Cold Start Analysis')))
  console.log(pc.dim('  ─'.repeat(25)))
  console.log()
}

/**
 * Prints summary statistics
 */
export function printSummary(result: ProfileResult): void {
  console.log(pc.bold('  📊 Summary'))
  console.log()

  const table = new Table({
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'left': '  ',
      'left-mid': '',
      'mid': '',
      'mid-mid': '',
      'right': '',
      'right-mid': '',
      'middle': ' ',
    },
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

/**
 * Prints the slowest modules table
 */
export function printSlowestModules(
  result: ProfileResult,
  config: ResolvedConfig,
  cwd: string
): void {
  const filtered = filterModules(result.modules, config)
  const slowest = getTopSlowest(filtered, config.topModules)

  if (slowest.length === 0) {
    console.log(pc.dim('  No modules found above the threshold'))
    return
  }

  const maxTime = slowest[0]?.loadTime || 1

  console.log(pc.bold(`  🐢 Slowest Modules (top ${config.topModules})`))
  console.log()

  const table = new Table({
    head: [pc.dim('#'), pc.dim('Module'), pc.dim('Time'), pc.dim('')],
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'left': '  ',
      'left-mid': '',
      'mid': '',
      'mid-mid': '',
      'right': '',
      'right-mid': '',
      'middle': ' ',
    },
    style: { 'padding-left': 0, 'padding-right': 1, 'head': [] },
    colWidths: [4, 50, 12, 22],
    wordWrap: true,
  })

  slowest.forEach((module, index) => {
    const simplified = simplifyUrl(module.resolvedUrl, cwd)
    table.push([
      pc.dim((index + 1).toString()),
      simplified.length > 48 ? simplified.slice(-48) : simplified,
      colorDuration(module.loadTime),
      createBar(module.loadTime, maxTime),
    ])
  })

  console.log(table.toString())
  console.log()
}

/**
 * Prints modules grouped by package
 */
export function printPackageGroups(
  result: ProfileResult,
  config: ResolvedConfig,
  _cwd: string
): void {
  const filtered = filterModules(result.modules, config)
  const groups = groupModulesByPackage(filtered)

  if (groups.length === 0) {
    return
  }

  const topGroups = groups.slice(0, 10)
  const maxTime = topGroups[0]?.totalTime || 1

  console.log(pc.bold('  📦 Slowest Packages'))
  console.log()

  const table = new Table({
    head: [pc.dim('#'), pc.dim('Package'), pc.dim('Modules'), pc.dim('Total'), pc.dim('')],
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'left': '  ',
      'left-mid': '',
      'mid': '',
      'mid-mid': '',
      'right': '',
      'right-mid': '',
      'middle': ' ',
    },
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

/**
 * Prints provider timing information
 */
export function printProviders(result: ProfileResult): void {
  if (result.providers.length === 0) {
    return
  }

  const sorted = [...result.providers].sort((a, b) => b.totalTime - a.totalTime)
  const maxTime = sorted[0]?.totalTime || 1

  console.log(pc.bold('  ⚡ Provider Boot Times'))
  console.log()

  const table = new Table({
    head: [pc.dim('#'), pc.dim('Provider'), pc.dim('Register'), pc.dim('Boot'), pc.dim('')],
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'left': '  ',
      'left-mid': '',
      'mid': '',
      'mid-mid': '',
      'right': '',
      'right-mid': '',
      'middle': ' ',
    },
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

/**
 * Prints recommendations based on the analysis
 */
export function printRecommendations(result: ProfileResult, config: ResolvedConfig): void {
  const recommendations: string[] = []

  // Check for slow total boot time
  if (result.totalTime > 2000) {
    recommendations.push('Total boot time is over 2s. Consider lazy-loading some providers.')
  }

  // Check for many modules
  if (result.summary.totalModules > 500) {
    recommendations.push(
      `Loading ${result.summary.totalModules} modules. Consider code splitting or lazy imports.`
    )
  }

  // Check for slow individual modules
  const filtered = filterModules(result.modules, config)
  const verySlowModules = filtered.filter((m) => m.loadTime > 100)
  if (verySlowModules.length > 0) {
    recommendations.push(
      `${verySlowModules.length} module(s) took over 100ms to load. Check for heavy initialization code.`
    )
  }

  if (recommendations.length === 0) {
    console.log(pc.bold('  ✅ ') + pc.green('No major issues detected!'))
  } else {
    console.log(pc.bold('  💡 Recommendations'))
    console.log()
    recommendations.forEach((rec) => {
      console.log(`  ${pc.yellow('•')} ${rec}`)
    })
  }

  console.log()
}

/**
 * Prints app files grouped by category
 */
export function printAppFiles(result: ProfileResult, cwd: string): void {
  const groups = result.summary.appFileGroups

  if (groups.length === 0) {
    return
  }

  console.log(pc.bold('  📁 App Files by Category'))
  console.log()

  for (const group of groups) {
    if (group.files.length === 0) continue

    const icon = categoryIcons[group.category] || ''
    const header = `  ${icon} ${group.displayName} (${group.files.length} files, ${formatDuration(group.totalTime)})`
    console.log(pc.bold(pc.white(header)))

    printAppFileGroup(group, cwd)
    console.log()
  }
}

/**
 * Prints a single app file group
 */
function printAppFileGroup(group: AppFileGroup, cwd: string): void {
  const maxTime = group.files[0]?.loadTime || 1

  const table = new Table({
    chars: {
      'top': '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      'bottom': '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      'left': '    ',
      'left-mid': '',
      'mid': '',
      'mid-mid': '',
      'right': '',
      'right-mid': '',
      'middle': ' ',
    },
    style: { 'padding-left': 0, 'padding-right': 1 },
    colWidths: [45, 12, 22],
  })

  for (const file of group.files) {
    const simplified = simplifyUrl(file.resolvedUrl, cwd)
    const fileName = simplified.split('/').pop() || simplified
    table.push([
      fileName.length > 43 ? fileName.slice(-43) : fileName,
      colorDuration(file.loadTime),
      createBar(file.loadTime, maxTime),
    ])
  }

  console.log(table.toString())
}

/**
 * Prints the footer
 */
export function printFooter(): void {
  console.log(pc.dim('  ─'.repeat(25)))
  console.log(pc.dim('  Run with --help for more options'))
  console.log()
}

/**
 * Generates and prints the full report
 */
export function printReport(result: ProfileResult, config: ResolvedConfig, cwd: string): void {
  printHeader()
  printSummary(result)
  printAppFiles(result, cwd)
  printSlowestModules(result, config, cwd)

  if (config.groupByPackage) {
    printPackageGroups(result, config, cwd)
  }

  printProviders(result)
  printRecommendations(result, config)
  printFooter()
}
