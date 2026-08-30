import { BaseCommand, flags } from '@adonisjs/core/ace'

/**
 * `migration:fresh` + todos os seeders. LARGA TODAS AS TABELAS.
 *
 * ⚠️ DOIS DEFEITOS QUE ESTE FICHEIRO TINHA, e que só se viam ao correr no servidor:
 *
 * 1. **Não passava `--force` ao `migration:fresh`.** Com `NODE_ENV=production` — que é
 *    como os serviços correm (ver os `Environment=` em /etc/systemd/system/*.service) — o
 *    Adonis pergunta "You are in production environment. Want to continue running
 *    migrations? (y/N)". Num pipeline sem terminal interactivo a resposta é sempre não, e
 *    a base ficava por reconstruir. O mesmo vale para o `db:seed`.
 *
 * 2. **Engolia o erro.** O `catch` registava a falha e não a propagava, portanto o
 *    processo saía com código 0. Um `migration:fresh` recusado ou rebentado a meio ficava
 *    indistinguível de um sucesso para quem encadeasse comandos — e o passo seguinte
 *    corria sobre uma base que não estava no estado esperado. É a pior classe de falha:
 *    a que se apresenta como funcional.
 *
 * O `--force` é um flag DESTE comando, e não é passado automaticamente. É deliberado: o
 * que este comando faz é apagar a base de dados inteira, e a única barreira que resta em
 * produção é alguém ter de escrever a palavra. Automatizá-lo seria remover a barreira.
 *
 *     node ace db:fresh:seed --force
 */
export default class FreshAndSeed extends BaseCommand {
  static commandName = 'db:fresh:seed'
  static description = 'LARGA todas as tabelas (migration:fresh) e corre todos os seeders'

  @flags.boolean({
    description:
      'Obrigatório fora de desenvolvimento. Confirma que percebe que TODAS as tabelas vão ser largadas.',
  })
  declare force: boolean

  async run() {
    const emProducao = process.env.NODE_ENV === 'production'

    if (emProducao && !this.force) {
      this.logger.error(
        'NODE_ENV=production. Este comando LARGA TODAS AS TABELAS desta base de dados.'
      )
      this.logger.error('Se é mesmo isso que quer, repita com --force.')
      this.exitCode = 1
      return
    }

    // Repassado aos dois: sem ele, ambos param à espera de uma resposta que nunca chega.
    const argumentos = this.force ? ['--force'] : []

    this.logger.info('migration:fresh — a largar todas as tabelas...')
    await this.kernel.exec('migration:fresh', argumentos)
    this.logger.success('migration:fresh concluída.')

    this.logger.info('db:seed — a semear...')
    await this.kernel.exec('db:seed', argumentos)
    this.logger.success('Seeders executados.')

    // Sem try/catch: um erro tem de propagar e sair com código diferente de zero, para
    // quem encadeia comandos parar aqui em vez de continuar sobre uma base meia feita.
    this.logger.info('Processo concluído.')
  }
}
