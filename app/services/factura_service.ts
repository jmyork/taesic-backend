import FacturaRepository from '#repositories/factura_repository'
import { AnularFacturaDTO, EmitirFacturaDTO, FacturaQueryDTO, ShowFacturaDTO } from '#dtos/factura_dto'

export default class FacturaService {
  private repo = new FacturaRepository()

  list(data: FacturaQueryDTO) {
    return this.repo.paginate(data)
  }

  show(data: ShowFacturaDTO) {
    return this.repo.findOrFail(data)
  }

  emitir(data: EmitirFacturaDTO) {
    return this.repo.emitir(data)
  }

  anular(data: AnularFacturaDTO) {
    return this.repo.anular(data)
  }
}
