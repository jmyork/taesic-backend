import PromotorAuthRepository from '#repositories/promotor_auth_repository'

export default class PromotorAuthService {
  repo = new PromotorAuthRepository()

  pedirOtp(email: string) {
    return this.repo.pedirOtp(email)
  }

  confirmarOtp(email: string, codigo: string) {
    return this.repo.confirmarOtp(email, codigo)
  }

  promotorPorToken(token: string) {
    return this.repo.promotorPorToken(token)
  }
}
