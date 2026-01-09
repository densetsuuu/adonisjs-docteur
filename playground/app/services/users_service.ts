import User from '#models/user'

export class UserService {
  async all() {
    return User.all()
  }
}
