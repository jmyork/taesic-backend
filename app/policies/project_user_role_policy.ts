import User from '#models/user'
import ProjectUserRole from '#models/project_user_role'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import project from '#models/project'
import project_role from '#models/project_role'
export default class ProjectUserRolePolicy extends BasePolicy {
  async edit(user: User, projectUserRole: ProjectUserRole): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project
    const currentProjectRole = await project_role.find(projectUserRole.project_role_id)
    const currentProject = await project.find(currentProjectRole?.project_id)

    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }

  async delete(user: User, projectUserRole: ProjectUserRole): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project
    const currentProjectRole = await project_role.find(projectUserRole.project_role_id)
    const currentProject = await project.find(currentProjectRole?.project_id)

    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }
}
