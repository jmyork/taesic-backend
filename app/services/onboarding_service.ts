import onboardingRepository from '#repositories/onboarding_repository'
import { AplicarRamosDTO, ConcluirOnboardingDTO } from '#dtos/onboarding_dto'

export default class onboardingService {
  repo = new onboardingRepository()

  estado(company_alias: string) {
    return this.repo.estado(company_alias)
  }

  aplicarRamos(data: AplicarRamosDTO) {
    return this.repo.aplicarRamos(data)
  }

  concluir(data: ConcluirOnboardingDTO) {
    return this.repo.concluir(data)
  }
}
