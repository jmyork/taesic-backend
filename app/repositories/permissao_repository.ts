import permissao from '#models/auth/permissao'
import { CreatepermissaoDTO, UpdatepermissaoDTO } from '#dtos/permissao_dto'
import BaseRepository from './base_repository.js'

export default class permissaoRepository extends BaseRepository<
  InstanceType<typeof permissao>,
  CreatepermissaoDTO,
  UpdatepermissaoDTO
> {
  constructor() {
    super(permissao, 'permissao')
  }
}
