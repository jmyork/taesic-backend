import RelatoriosPlataformaRepository from '#repositories/relatorios_plataforma_repository'
import { RelatoriosPlataformaFilterDTO } from '#dtos/relatorios_plataforma_dto'

export default class RelatoriosPlataformaService {
  private repo = new RelatoriosPlataformaRepository()

  contasReceber(data: RelatoriosPlataformaFilterDTO) {
    return this.repo.contasReceber(data)
  }

  receitaPlataforma(data: RelatoriosPlataformaFilterDTO) {
    return this.repo.receitaPlataforma(data)
  }

  empresasResumo() {
    return this.repo.empresasResumo()
  }

  usoPlataforma(data: RelatoriosPlataformaFilterDTO) {
    return this.repo.usoPlataforma(data)
  }

  auditoria(data: RelatoriosPlataformaFilterDTO) {
    return this.repo.auditoria(data)
  }
}
