import cliente from '#models/cliente'
import Empresa from '#models/empresa'
import { CreateclienteDTO, UpdateclienteDTO } from '#dtos/cliente_dto'
import BaseRepository from './base_repository.js'

export default class clienteRepository extends BaseRepository<
  InstanceType<typeof cliente>,
  CreateclienteDTO & { company_alias?: string },
  UpdateclienteDTO
> {
  constructor() {
    super(cliente, 'cliente')
  }

  protected scopeToTenant(query: any, companyAlias: string) {
    return query
      .join('empresa', 'empresa.id', 'cliente.empresa_id')
      .where('empresa.company_alias', companyAlias)
  }

  async create(data: CreateclienteDTO & { company_alias?: string }) {
    const { company_alias, ...clienteData } = data
    if (company_alias) {
      const empresa = await Empresa.findByOrFail('company_alias', company_alias)
      return cliente.create({ ...clienteData, empresa_id: empresa.id })
    }
    return cliente.create(clienteData)
  }
}
