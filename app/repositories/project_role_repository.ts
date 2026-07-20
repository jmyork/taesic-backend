import project_role from '#models/authplatform/project_role'
import { Createproject_roleDTO, Updateproject_roleDTO } from '#dtos/project_role_dto'
import BaseRepository from './base_repository.js'

export default class project_roleRepository extends BaseRepository<
  InstanceType<typeof project_role>,
  Createproject_roleDTO,
  Updateproject_roleDTO
> {
  constructor() {
    super(project_role, 'project_role')
  }
}
