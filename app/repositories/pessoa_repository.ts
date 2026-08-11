import db from '@adonisjs/lucid/services/db'
import pessoa from '#models/pessoa'
import Empresa from '#models/empresa'
import { CreatepessoaDTO, UpdatepessoaDTO } from '#dtos/pessoa_dto'
import BaseRepository from './base_repository.js'
import { proximoNumeroPorEmpresa } from '../helpers/sequencial_numero.js'

export default class pessoaRepository extends BaseRepository<
  InstanceType<typeof pessoa>,
  CreatepessoaDTO & { company_alias?: string },
  UpdatepessoaDTO
> {
  constructor() {
    super(pessoa, 'pessoa')
  }

  protected scopeToTenant(query: any, companyAlias: string) {
    return query
      .join('empresa', 'empresa.id', 'pessoa.empresa_id')
      .where('empresa.company_alias', companyAlias)
  }

  async create(data: CreatepessoaDTO & { company_alias?: string }) {
    const { company_alias, ...pessoaData } = data
    if (company_alias) {
      const empresa = await Empresa.findByOrFail('company_alias', company_alias)
      return db.transaction(async (trx) => {
        const numero = await proximoNumeroPorEmpresa(trx, empresa.id, pessoa)
        return pessoa.create({ ...pessoaData, empresa_id: empresa.id, numero }, { client: trx })
      })
    }
    return pessoa.create(pessoaData)
  }
}
