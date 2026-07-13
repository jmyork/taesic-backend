import User from '#models/user'
import Project from '#models/authplatform/project'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import { IsUserAnAdmin, IsUserResource } from '../helpers/Utils.js'

export default class ProjectPolicy extends BasePolicy {
  public async edit(user: User, project: Project): Promise<AuthorizerResponse> {
    return (await IsUserResource(user, project)) || (await IsUserAnAdmin(user))
  }

  public async delete(user: User, project: Project): Promise<AuthorizerResponse> {
    return (await IsUserResource(user, project)) || (await IsUserAnAdmin(user))
  }
}
