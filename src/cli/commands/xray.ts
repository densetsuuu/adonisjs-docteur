import { defineCommand } from 'citty'
import { isAdonisProject, profile } from '../../profiler/profiler.js'
import { TuiReporter } from '../../profiler/reporters/tui_reporter.js'
import { ui } from '../../profiler/reporters/format.js'

export const xrayCommand = defineCommand({
  meta: {
    name: 'xray',
    description: 'Interactive module dependency explorer',
  },
  args: {
    entry: {
      type: 'string',
      description: 'Entry point to profile',
      default: 'bin/server.ts',
    },
  },
  async run({ args }) {
    const cwd = process.cwd()

    if (!isAdonisProject(cwd)) {
      ui.logger.error('Not an AdonisJS project. Make sure adonisrc.ts exists.')
      process.exit(1)
    }

    ui.logger.info('Starting cold start analysis...')

    try {
      const result = await profile(cwd, {
        entryPoint: args.entry,
        suppressOutput: true,
      })

      const reporter = new TuiReporter()
      await reporter.render({
        result,
        cwd,
        config: {
          topModules: 20,
          threshold: 1,
          includeNodeModules: true,
          groupByPackage: true,
        },
      })
    } catch (error) {
      ui.logger.error('Profiling failed')
      if (error instanceof Error) {
        ui.logger.error(error.message)
      }
      process.exit(1)
    }
  },
})
