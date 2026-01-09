import { inject } from '@adonisjs/core'
import { SlowService } from '#services/slow_service'

import { Get } from '@adonisjs-community/girouette'

@inject()
export class SlowController {
  constructor(private slowService: SlowService) {}

  @Get('/slow')
  async index() {
    return {
      message: this.slowService.greet(),
    }
  }
}
