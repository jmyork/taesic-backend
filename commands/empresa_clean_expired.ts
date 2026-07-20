import { BaseCommand } from '@adonisjs/core/ace'
import EmpresaRepository from '#repositories/empresa_repository'

export default class CleanExpiredPendingCompanies extends BaseCommand {
  static commandName = 'empresa:clean:expired'
  static description = 'Remove empresas não ativadas cujo token de ativação expirou'

  async run() {
    try {
      const deletedCount = await new EmpresaRepository().deleteExpiredUnverified()

      if (deletedCount === 0) {
        this.logger.info('Nenhuma empresa expirada encontrada.')
      } else {
        this.logger.success(`${deletedCount} empresa(s) não ativada(s) removida(s) com sucesso.`)
      }
    } catch (error) {
      this.logger.error('Erro ao limpar empresas expiradas:')
      console.error(error)
    }
  }
}
