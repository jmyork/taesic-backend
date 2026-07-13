import produtos_reembolsoRepository from '#repositories/produtos_reembolso_repository'
import {
  ProdutosReembolsoQueryDTO,
  ReembolsoParcialDTO,
  ReembolsoTotalDTO,
  ShowProdutosReembolsoDTO,
} from '#dtos/produtos_reembolso_dto'

export default class produtos_reembolsoService {
  repo = new produtos_reembolsoRepository()

  list(page?: number, limit?: number, filter?: ProdutosReembolsoQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  show(data: ShowProdutosReembolsoDTO) {
    return this.repo.findOrFail(data)
  }

  reembolsar_total(data: ReembolsoTotalDTO) {
    return this.repo.reembolsar_total(data)
  }

  reembolsar_parcial(data: ReembolsoParcialDTO) {
    return this.repo.reembolsar_parcial(data)
  }
}
