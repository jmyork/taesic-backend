import project_user from '#models/authplatform/project_user'
import { Createproject_userDTO, Updateproject_userDTO } from '#dtos/project_user_dto'
import BaseRepository from './base_repository.js'

export default class project_userRepository extends BaseRepository<
  InstanceType<typeof project_user>,
  Createproject_userDTO,
  Updateproject_userDTO
> {
  constructor() {
    super(project_user, 'project_user')
  }
}
