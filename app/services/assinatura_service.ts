import assinaturaRepository from '#repositories/assinatura_repository'

export default class assinaturaService {
  repo = new assinaturaRepository()

  estado(company_alias: string) {
    return this.repo.estado(company_alias)
  }

  planos() {
    return this.repo.planosDisponiveis()
  }

  escolherPlano(company_alias: string, plano_id: string) {
    return this.repo.escolherPlano(company_alias, plano_id)
  }

  emitirCobrancaPendente(company_alias: string) {
    return this.repo.emitirCobrancaPendente(company_alias)
  }
}
