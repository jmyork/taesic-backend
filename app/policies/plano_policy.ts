import User from '#models/user'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { IsUserAnAdmin } from '../helpers/Utils.js'

export default class PlanoPolicy extends BasePolicy {
    public async store(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async update(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async delete(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async show(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async index(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }
}
