/*
|--------------------------------------------------------------------------
| Configure hook
|--------------------------------------------------------------------------
|
| The configure hook is called when someone runs "node ace configure <package>"
| command. You are free to perform any operations inside this function to
| configure the package.
|
| To make things easier, you have access to the underlying "ConfigureCommand"
| instance and you can use codemods to modify the source files.
|
*/

import type ConfigureCommand from '@adonisjs/core/commands/configure'

export async function configure(command: ConfigureCommand) {
  const codemods = await command.createCodemods()

  /**
   * Register commands
   */
  await codemods.updateRcFile((rcFile) => {
    rcFile.addCommand('docteur/commands')
  })

  command.logger.success('Docteur configured successfully!')
  command.logger.info('Run "node ace docteur:diagnose" to analyze cold start')
  command.logger.info('Run "node ace docteur:xray" for interactive exploration')
}
