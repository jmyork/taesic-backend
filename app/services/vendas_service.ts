import vendasRepository from '#repositories/vendas_repository'
import {
  CreateVendasDTO,
  VendaAjustarDTO,
  VendaCloseDTO,
  VendaEntregarDTO,
  VendaShowDTO,
  VendasQueryDTO,
} from '#dtos/vendas_dto'

export default class vendasService {
    repo = new vendasRepository()

    list(page?: number, limit?: number, filter?: VendasQueryDTO) {
        return this.repo.paginate(page, limit, filter)
    }

    create(data: CreateVendasDTO) {
        return this.repo.create(data)
    }

    close(data: VendaCloseDTO) {
        return this.repo.close(data)
    }

    cancel(data: VendaCloseDTO) {
        return this.repo.cancel(data)
    }

    /** Entregar o produto de uma venda por adiantamento — dá baixa no stock e titula a venda. */
    entregar(data: VendaEntregarDTO) {
        return this.repo.entregar(data)
    }

    /** Ajustar uma venda fechada para cima — emite a nota de débito. */
    ajustar(data: VendaAjustarDTO) {
        return this.repo.ajustar(data)
    }

    // update(id: string, data: UpdateVendasDTO) {
    //     return this.repo.update(id, data)
    // }

    show(data: VendaShowDTO) {
        return this.repo.findOrFail(data)
    }

    // delete(id: string, company_alias?: string) {
    //     return this.repo.softDelete(id, company_alias)
    // }
}
