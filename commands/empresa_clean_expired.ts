import { BaseCommand } from '@adonisjs/core/ace'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export default class CleanExpiredPendingCompanies extends BaseCommand {
  static commandName = 'empresa:clean:expired'
  static description = 'Remove empresas não ativadas após 24 horas'

  async run() {
    try {
      const now = DateTime.now()

      // Busca empresas não verificadas com token expirado
      const deletedCount = await db
        .from('empresa')
        .where('verifiyed', false)
        .where('verification_token_expires_at', '<', now.toSQL())
        .whereNotNull('verification_token')
        .delete()

      this.logger.success(`${deletedCount} empresa(s) não ativada(s) removida(s) com sucesso.`)

      if (deletedCount === 0) {
        this.logger.info('Nenhuma empresa expirada encontrada.')
      }
    } catch (error) {
      this.logger.error('Erro ao limpar empresas expiradas:')
      console.error(error)
    }
  }
}
