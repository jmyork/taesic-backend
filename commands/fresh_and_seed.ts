import { BaseCommand } from '@adonisjs/core/ace'

export default class FreshAndSeed extends BaseCommand {
  static commandName = 'db:fresh:seed'
  static description = 'Executa migration:fresh e depois roda todos os seeders'

  async run() {
    try {
      this.logger.info('Iniciando migration:fresh...')
      await this.kernel.exec('migration:fresh', [])

      this.logger.success('Migration:fresh concluída com sucesso!')

      this.logger.info('Iniciando seeders...')
      await this.kernel.exec('db:seed', [])

      this.logger.success('Seeders executados com sucesso!')
      this.logger.info('Processo concluído!')
    } catch (error) {
      this.logger.error('Erro ao executar migration:fresh e seeders:')
      console.error(error)
    }
  }
}
