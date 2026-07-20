import papel_permissao from '#models/auth/papel_permissao'
import { Createpapel_permissaoDTO, Updatepapel_permissaoDTO } from '#dtos/papel_permissao_dto'
import BaseRepository from './base_repository.js'

export default class papel_permissaoRepository extends BaseRepository<
  InstanceType<typeof papel_permissao>,
  Createpapel_permissaoDTO,
  Updatepapel_permissaoDTO
> {
  constructor() {
    super(papel_permissao, 'papel_permissao')
  }
}
