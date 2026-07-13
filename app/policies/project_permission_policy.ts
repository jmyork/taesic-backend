import User from '#models/user'
import ProjectPermission from '#models/project_permission'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import project from '#models/project'
export default class ProjectPermissionPolicy extends BasePolicy {
  async edit(user: User, projectPermission: ProjectPermission): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project permission
    const currentProject = await project.find(projectPermission.project_id)
    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }

  async delete(user: User, projectPermission: ProjectPermission): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project permission
    const currentProject = await project.find(projectPermission.project_id)
    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }
}
