import { flags } from '@adonisjs/core/ace'
import { ConsoleReporter } from '../src/profiler/reporters/console_reporter.js'
import BaseProfilerCommand from '../src/profiler/base_command.js'
import { type CommandOptions } from '@adonisjs/core/types/ace'

export default class Diagnose extends BaseProfilerCommand {
  static commandName = 'docteur:diagnose'
  static description = 'Analyze cold start performance'
  static options: CommandOptions = { startApp: false, staysAlive: false }

  @flags.number({ description: 'Number of slowest modules to display', default: 20 })
  declare top: number

  @flags.number({ description: 'Only show modules slower than this threshold (in ms)', default: 1 })
  declare threshold: number

  @flags.boolean({ description: 'Include node_modules in the analysis', default: true })
  declare nodeModules: boolean

  @flags.boolean({ description: 'Group modules by package name', default: true })
  declare group: boolean

  async run() {
    const cwd = this.app.appRoot.pathname
    const paths = this.validatePaths(cwd)
    if (!paths) return

    this.logger.info('Starting cold start analysis...')
    this.logger.info(`Entry point: ${paths.entryPoint}`)

    const result = await this.profileApp(paths.loaderPath, paths.entryPoint, cwd)

    const reporter = new ConsoleReporter()
    reporter.render({
      result,
      cwd,
      config: {
        topModules: this.top,
        threshold: this.threshold,
        includeNodeModules: this.nodeModules,
        groupByPackage: this.group,
      },
    })
  }
}
