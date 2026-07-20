import User from '#models/user'
import ProjectPermissionRole from '#models/authplatform/project_permission_role'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import project from '#models/authplatform/project'
import permissao from '#models/authplatform/project_permission'
export default class ProjectPermissionRolePolicy extends BasePolicy {
  async edit(
    user: User,
    projectPermissionRole: ProjectPermissionRole
  ): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project permission role
    const currentPermissionRole = await permissao.find(projectPermissionRole.project_permission_id)
    const currentProject = await project.find(currentPermissionRole?.project_id)

    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }

  async delete(
    user: User,
    projectPermissionRole: ProjectPermissionRole
  ): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project permission role
    const currentPermissionRole = await permissao.find(projectPermissionRole.project_permission_id)
    const currentProject = await project.find(currentPermissionRole?.project_id)

    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }
}
