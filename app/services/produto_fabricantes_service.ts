import produto_fabricantesRepository from '#repositories/produto_fabricantes_repository'
import {
  Createproduto_fabricantesDTO,
  Updateproduto_fabricantesDTO,
} from '#dtos/produto_fabricantes_dto'
import { ProdutoFabricanteQueryDTO } from '#dtos/produto_fabricantes_dto'

export default class produto_fabricantesService {
  repo = new produto_fabricantesRepository()

  list(page?: number, limit?: number, filter?: ProdutoFabricanteQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_fabricantesDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_fabricantesDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
