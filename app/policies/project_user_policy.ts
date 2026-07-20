import User from '#models/user'
import ProjectUser from '#models/authplatform/project_user'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
import project from '#models/authplatform/project'
export default class ProjectUserPolicy extends BasePolicy {
  async edit(user: User, projectUser: ProjectUser): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project user
    const currentProject = await project.find(projectUser.project_id)
    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }

  async delete(user: User, projectUser: ProjectUser): Promise<AuthorizerResponse> {
    // Check if the user is the owner of the project user
    const currentProject = await project.find(projectUser.project_id)
    if (currentProject?.user_id === user.id) {
      return true
    }
    // Otherwise, deny access
    return false
  }
}
