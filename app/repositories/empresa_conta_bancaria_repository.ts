import empresa_conta_bancaria from '#models/empresa_conta_bancaria'
import {
  Createempresa_conta_bancariaDTO,
  Updateempresa_conta_bancariaDTO,
} from '#dtos/empresa_conta_bancaria_dto'
import BaseRepository from './base_repository.js'

export default class empresa_conta_bancariaRepository extends BaseRepository<
  InstanceType<typeof empresa_conta_bancaria>,
  Createempresa_conta_bancariaDTO,
  Updateempresa_conta_bancariaDTO
> {
  constructor() {
    super(empresa_conta_bancaria, 'empresa_conta_bancaria')
  }
}
