import project_permission_role from '#models/authplatform/project_permission_role'
import {
  Createproject_permission_roleDTO,
  Updateproject_permission_roleDTO,
} from '#dtos/project_permission_role_dto'
import BaseRepository from './base_repository.js'

export default class project_permission_roleRepository extends BaseRepository<
  InstanceType<typeof project_permission_role>,
  Createproject_permission_roleDTO,
  Updateproject_permission_roleDTO
> {
  constructor() {
    super(project_permission_role, 'project_permission_role')
  }
}
