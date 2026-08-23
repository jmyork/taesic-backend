import papel from '#models/auth/papel'
import { CreatepapelDTO, UpdatepapelDTO } from '#dtos/papel_dto'
import BaseRepository from './base_repository.js'

/**
 * O recurso `papel` da PLATAFORMA — restrito aos papéis do dono da plataforma.
 *
 * A tabela `papel` passou a guardar três coisas: os papéis de plataforma, os
 * modelos clonados no registo de cada empresa, e as cópias de cada empresa. Estas
 * rotas só governam as duas primeiras, e a restrição está aqui em vez de estar
 * espalhada por cada método porque `baseQuery()` é o ponto por onde `paginate`,
 * `findOrFail`, `update` e `softDelete` passam todos.
 *
 * Duas razões, e a segunda é de segurança:
 *
 * 1. Sem isto, a listagem de papéis da plataforma passaria a ser dominada pelas
 *    cópias dos inquilinos — 10 linhas por empresa. Com 200 empresas seriam 2000
 *    linhas de dados alheios a enterrar as 15 que interessam.
 *
 * 2. `update` e `softDelete` desta rota não têm — nem faz sentido terem — qualquer
 *    noção de empresa. Sem esta restrição, um `PUT api/papel/<id>` com o id de um
 *    papel de um inquilino renomeava-o, ou apagava-o, a partir de uma rota que não
 *    é dele. Os papéis de uma empresa geram-se em `api/:company_alias/papeis`, que
 *    filtra por empresa em todas as consultas.
 */
export default class papelRepository extends BaseRepository<
  InstanceType<typeof papel>,
  CreatepapelDTO,
  UpdatepapelDTO
> {
  constructor() {
    super(papel, 'papel')
  }

  /** `empresa_id IS NULL` é exactamente "plataforma ou modelo" — ver a CHECK na BD. */
  baseQuery() {
    return this.model.query().whereNull('papel.empresa_id')
  }
}
