import User from '#models/user'
import ProjectRole from '#models/authplatform/project_role'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import project from '#models/authplatform/project'

export default class ProjectRolePolicy extends BasePolicy {
  async edit(user: User, projectRole: ProjectRole): Promise<AuthorizerResponse> {
    const currentProject = await project.find(projectRole.project_id)
    // Check if the user is the owner of the project role
    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }

  async delete(user: User, projectRole: ProjectRole): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project role
    const currentProject = await project.find(projectRole.project_id)

    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }
}
