import User from '#models/user'
import { signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'

import { Get, Group, Post } from '@adonisjs-community/girouette'
import { type UserService } from '#services/users_service'
import { inject } from '@adonisjs/core'

/**
 * NewAccountController handles user registration.
 * It provides methods for displaying the signup page and creating
 * new user accounts.
 */
@inject()
@Group({})
export default class NewAccountController {
  constructor(private usersService: UserService) {}
  /**
   * Display the signup page
   */
  @Get('/create')
  async create({ view }: HttpContext) {
    return view.render('pages/auth/signup')
  }

  /**
   * Create a new user account and authenticate the user
   */
  @Post('/store')
  async store({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(signupValidator)
    const user = await User.create({ ...payload })

    await auth.use('web').login(user)
    response.redirect().toRoute('new account.home')
  }

  @Get('/', 'home')
  async index({}: HttpContext) {
    return await this.usersService.all()
  }
}
