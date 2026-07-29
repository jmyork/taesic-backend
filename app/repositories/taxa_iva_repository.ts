import taxa_iva from '#models/taxa_iva'
import { CreatetaxaivaDTO, UpdatetaxaivaDTO } from '#dtos/taxa_iva_dto'
import BaseRepository from './base_repository.js'

export default class taxaIvaRepository extends BaseRepository<
  InstanceType<typeof taxa_iva>,
  CreatetaxaivaDTO,
  UpdatetaxaivaDTO
> {
  constructor() {
    super(taxa_iva, 'taxa_iva')
  }
}
