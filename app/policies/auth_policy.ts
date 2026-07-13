import User from '#models/user'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { IsUserAnAdmin } from '../helpers/Utils.js'

export default class AuthPolicy extends BasePolicy {
  public async index(user: User): Promise<AuthorizerResponse> {
    return await IsUserAnAdmin(user)
  }
}
