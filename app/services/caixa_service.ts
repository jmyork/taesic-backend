import caixaRepository from '#repositories/caixa_repository'
import { CaixaQueryDTO, CloseCaixaDTO, OpenCaixaDTO, ReOpenCaixaDTO } from '#dtos/caixa_dto'

export default class caixaService {
  repo = new caixaRepository()

  list(page?: number, limit?: number, filter?: CaixaQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  open(data: OpenCaixaDTO) {
    return this.repo.open(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  destroy(id: string, data: CloseCaixaDTO | ReOpenCaixaDTO) {
    return this.repo.destroy(id, data)
  }

  // close(id: string, data: CloseCaixaDTO) {
  //   return this.repo.close(id, data)
  // }

  // reopen(id: string, data: ReOpenCaixaDTO) {
  //   return this.repo.reopen(id, data)
  // }

  listByUser(user_id: string, filter?: CaixaQueryDTO) {
    return this.repo.listByUser(user_id, filter)
  }
}
