import project from '#models/authplatform/project'
import { CreateprojectDTO, UpdateprojectDTO } from '#dtos/project_dto'
import BaseRepository from './base_repository.js'

export default class projectRepository extends BaseRepository<
  InstanceType<typeof project>,
  CreateprojectDTO,
  UpdateprojectDTO
> {
  constructor() {
    super(project, 'project')
  }
}
