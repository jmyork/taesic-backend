import NifRepository from '#repositories/nif_repository'

export default class NifService {
  repo = new NifRepository()

  consultar(nif: string, opcoes?: { force?: boolean }) {
    return this.repo.consultar(nif, opcoes)
  }
}
