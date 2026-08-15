import cupomRepository from '#repositories/cupom_repository'
import { CreatecupomDTO, CupomQueryDTO, UpdatecupomDTO } from '#dtos/cupom_dto'

export default class cupomService {
  repo = new cupomRepository()

  list(page: number, limit: number, filter?: CupomQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreatecupomDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatecupomDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }

  /**
   * Consulta um cupão pelo CÓDIGO, para o ecrã de venda poder mostrar o desconto ANTES de
   * cobrar. Usa exactamente a mesma consulta que `vendas_repository.close()` usa para o
   * resolver (`findValidoPorCodigo`), de propósito: se o ecrã e o fecho da venda usassem
   * regras diferentes de validade, o operador veria um desconto que depois seria recusado.
   *
   * Devolve `null` quando o código não existe, pertence a outra empresa, está removido ou
   * está expirado — quem chama decide o código HTTP.
   */
  validarPorCodigo(codigo: string, company_alias?: string) {
    return this.repo.findValidoPorCodigo(codigo, company_alias)
  }
}
