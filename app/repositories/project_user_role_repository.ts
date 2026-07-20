import project_user_role from '#models/authplatform/project_user_role'
import { Createproject_user_roleDTO, Updateproject_user_roleDTO } from '#dtos/project_user_role_dto'
import BaseRepository from './base_repository.js'

export default class project_user_roleRepository extends BaseRepository<
  InstanceType<typeof project_user_role>,
  Createproject_user_roleDTO,
  Updateproject_user_roleDTO
> {
  constructor() {
    super(project_user_role, 'project_user_role')
  }
}
