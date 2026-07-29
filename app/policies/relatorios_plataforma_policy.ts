import User from '#models/user'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { IsUserAnAdmin } from '../helpers/Utils.js'

export default class RelatoriosPlataformaPolicy extends BasePolicy {
    public async contasReceber(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async receitaPlataforma(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async empresasResumo(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async usoPlataforma(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }

    public async auditoria(user: User): Promise<AuthorizerResponse> {
        return await IsUserAnAdmin(user)
    }
}
