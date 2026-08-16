import { BaseCommand } from '@adonisjs/core/ace'
import EmpresaRepository from '#repositories/empresa_repository'

/**
 * Remove as contas de empresa que nunca foram activadas dentro do prazo do link de
 * activação (24h — ver `VerificationTokenHashService.createToken`).
 *
 * Correr por cron externo, como os restantes trabalhos periódicos deste projecto:
 *
 *   0 3 * * *  cd /caminho/para/taesic-backend && node ace empresa:clean:expired
 *
 * `startApp: true` NÃO é opcional: sem isso o comando corre com a aplicação por arrancar,
 * o serviço de base de dados vem `undefined` e o comando rebentava com
 * "Cannot read properties of undefined (reading 'from')" — o que acontecia em TODAS as
 * execuções reais. Passava despercebido porque os testes chamam o repositório
 * directamente (com a app já a correr) e porque o erro era apanhado e registado com
 * saída 0: um cron dava tudo por bem-sucedido sem nunca apagar nada.
 */
export default class CleanExpiredPendingCompanies extends BaseCommand {
  static commandName = 'empresa:clean:expired'
  static description = 'Remove empresas não ativadas cujo token de ativação expirou'
  static options = { startApp: true }

  async run() {
    try {
      const deletedCount = await new EmpresaRepository().deleteExpiredUnverified()

      if (deletedCount === 0) {
        this.logger.info('Nenhuma empresa expirada encontrada.')
      } else {
        this.logger.success(`${deletedCount} empresa(s) não ativada(s) removida(s) com sucesso.`)
      }
    } catch (error) {
      // Sair com código de erro: um trabalho agendado tem de falhar de forma visível,
      // não registar o problema e reportar sucesso.
      this.logger.error('Erro ao limpar empresas expiradas:')
      this.error = error as Error
      this.exitCode = 1
    }
  }
}
