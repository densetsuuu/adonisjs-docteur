import { defineCommand } from 'citty'
import { isAdonisProject, profile } from '../../profiler/profiler.js'
import { ConsoleReporter } from '../../profiler/reporters/console_reporter.js'
import { ui } from '../../profiler/reporters/format.js'

export const diagnoseCommand = defineCommand({
  meta: {
    name: 'diagnose',
    description: 'Analyze cold start performance',
  },
  args: {
    'top': {
      type: 'string',
      description: 'Number of slowest modules to display',
      default: '20',
    },
    'threshold': {
      type: 'string',
      description: 'Only show modules slower than this threshold (in ms)',
      default: '1',
    },
    'node-modules': {
      type: 'boolean',
      description: 'Include node_modules in the analysis',
      default: true,
    },
    'group': {
      type: 'boolean',
      description: 'Group modules by package name',
      default: true,
    },
    'entry': {
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
    ui.logger.info(`Entry point: ${args.entry}`)

    try {
      const result = await profile(cwd, { entryPoint: args.entry })

      const reporter = new ConsoleReporter()
      reporter.render({
        result,
        cwd,
        config: {
          topModules: Number.parseInt(args.top, 10),
          threshold: Number.parseInt(args.threshold, 10),
          includeNodeModules: args['node-modules'],
          groupByPackage: args.group,
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
