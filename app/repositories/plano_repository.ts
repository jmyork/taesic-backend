import plano from '#models/plano'
import { CreateplanoDTO, UpdateplanoDTO } from '#dtos/plano_dto'
import BaseRepository from './base_repository.js'

export default class planoRepository extends BaseRepository<
  InstanceType<typeof plano>,
  CreateplanoDTO,
  UpdateplanoDTO
> {
  constructor() {
    super(plano, 'plano')
  }
}
