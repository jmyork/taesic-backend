import venda_itensRepository from '#repositories/venda_itens_repository'
import { Createvenda_itensDTO, VendaItensQueryDTO } from '#dtos/venda_itens_dto'

export default class venda_itensService {
  repo = new venda_itensRepository()

  list(page?: number, limit?: number, filter?: VendaItensQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createvenda_itensDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }


  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  } 
}
