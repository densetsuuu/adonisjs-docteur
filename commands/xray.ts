/*
|--------------------------------------------------------------------------
| Docteur X-Ray Command
|--------------------------------------------------------------------------
|
| Interactive TUI for exploring module dependencies and cold start times.
| Provides a navigable interface for drilling into the dependency graph.
|
*/

import type { CommandOptions } from '@adonisjs/core/types/ace'
import { TuiReporter } from '../src/profiler/reporters/tui_reporter.js'
import BaseProfilerCommand from '../src/profiler/base_command.js'

export default class XRay extends BaseProfilerCommand {
  static commandName = 'docteur:xray'
  static description = 'Interactive module dependency explorer'

  static options: CommandOptions = {
    startApp: false,
    staysAlive: true,
  }

  /**
   * Entry point for the xray command.
   * Profiles the application then launches an interactive TUI for exploration.
   */
  async run() {
    const cwd = this.app.appRoot.pathname
    const paths = this.validatePaths(cwd)
    if (!paths) return

    this.logger.info('Profiling application...')

    const result = await this.profileApp(paths.loaderPath, paths.entryPoint, cwd, {
      suppressOutput: true,
    })

    const reporter = new TuiReporter()
    await reporter.render({
      result,
      cwd,
      config: { topModules: 20, threshold: 1, includeNodeModules: true, groupByPackage: true },
    })
  }
}
