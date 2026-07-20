import project_permission from '#models/authplatform/project_permission'
import {
  Createproject_permissionDTO,
  Updateproject_permissionDTO,
} from '#dtos/project_permission_dto'
import BaseRepository from './base_repository.js'

export default class project_permissionRepository extends BaseRepository<
  InstanceType<typeof project_permission>,
  Createproject_permissionDTO,
  Updateproject_permissionDTO
> {
  constructor() {
    super(project_permission, 'project_permission')
  }
}
