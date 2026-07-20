import papel from '#models/auth/papel'
import { CreatepapelDTO, UpdatepapelDTO } from '#dtos/papel_dto'
import BaseRepository from './base_repository.js'

export default class papelRepository extends BaseRepository<
  InstanceType<typeof papel>,
  CreatepapelDTO,
  UpdatepapelDTO
> {
  constructor() {
    super(papel, 'papel')
  }
}
