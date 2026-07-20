import user_papel from '#models/auth/user_papel'
import { Createuser_papelDTO, Updateuser_papelDTO } from '#dtos/user_papel_dto'
import BaseRepository from './base_repository.js'

export default class user_papelRepository extends BaseRepository<
  InstanceType<typeof user_papel>,
  Createuser_papelDTO,
  Updateuser_papelDTO
> {
  constructor() {
    super(user_papel, 'user_papel')
  }
}
