/*
|--------------------------------------------------------------------------
| Docteur Service Provider
|--------------------------------------------------------------------------
|
| This provider registers the Docteur commands with the AdonisJS application.
|
*/

import type { ApplicationService } from '@adonisjs/core/types'

export default class DocteurProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register bindings to the container
   */
  register() {}

  /**
   * Boot the provider
   */
  async boot() {}

  /**
   * Shutdown hook
   */
  async shutdown() {}
}
