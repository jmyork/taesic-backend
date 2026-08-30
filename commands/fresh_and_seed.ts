import { BaseCommand, flags } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'

/**
 * `migration:fresh` + todos os seeders. LARGA TODAS AS TABELAS.
 *
 * ⚠️ DOIS DEFEITOS QUE ESTE FICHEIRO TINHA, e que só se viam ao correr no servidor:
 *
 * 1. **Não passava `--force` ao `migration:fresh`.** Com `NODE_ENV=production` — que é
 *    como os serviços correm (ver os `Environment=` em /etc/systemd/system/*.service) — o
 *    Adonis pergunta "You are in production environment. Want to continue running
 *    migrations? (y/N)". Num pipeline sem terminal interactivo a resposta é sempre não, e
 *    a base ficava por reconstruir.
 *
 * 2. **Engolia o erro.** O `catch` registava a falha e não a propagava, portanto o
 *    processo saía com código 0. Um `migration:fresh` recusado ou rebentado a meio ficava
 *    indistinguível de um sucesso para quem encadeasse comandos — e o passo seguinte
 *    corria sobre uma base que não estava no estado esperado. É a pior classe de falha:
 *    a que se apresenta como funcional.
 *
 * ⚠️ E UM TERCEIRO, INTRODUZIDO AO CORRIGIR O PRIMEIRO:
 *
 * 3. **O `--force` era passado TAMBÉM ao `db:seed`, e o `db:seed` não o aceita.** A
 *    correcção acima trazia a frase "o mesmo vale para o db:seed", que era uma suposição
 *    nunca verificada — e é falsa. Em `@adonisjs/lucid`, a guarda de produção vive em
 *    `commands/migration/_base.js` e em `db_wipe`/`db_truncate`. O `db:seed` **não tem
 *    guarda nenhuma** e os únicos flags que declara são `--connection`, `--interactive`,
 *    `--files` e `--compact-output`.
 *
 *    O resultado no servidor foi o pior possível: o `migration:fresh` correu com sucesso
 *    — largou todas as tabelas e recriou o esquema — e o `db:seed` rebentou logo a seguir
 *    com `Unknown flag "--force"`. Ficou uma base vazia, sem planos e sem catálogo RBAC,
 *    em qualidade E em produção. Sem planos, o onboarding abre empresas sem subscrição e
 *    `limites_do_plano.ts` não impõe limite a quem não tem plano; sem papéis de
 *    plataforma, o `/instalacao` do backoffice aborta e não há como criar a primeira conta.
 *
 *    A lição, que já está em 7.19 por outra via: **um flag que se "sabe" que existe
 *    verifica-se no comando que o vai receber.** Custa um grep.
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

  // Obrigatorio desde que este comando passou a LER a base para se verificar a si
  // proprio: sem a app arrancada, o servico `db` nao esta registado.
  static options = { startApp: true }

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

    // SÓ para o `migration:fresh`. Sem ele, pára em produção à espera de uma resposta
    // que num pipeline nunca chega.
    //
    // O `db:seed` NÃO leva nada: não declara `--force` (rebenta com `Unknown flag`) e não
    // tem guarda de produção nenhuma — a de `@adonisjs/lucid` vive em
    // `commands/migration/_base.js` e em `db_wipe`/`db_truncate`, e o seed não passa por
    // lá. Ver o aviso 3 no cabeçalho: passar-lho deixou duas bases vazias.
    this.logger.info('migration:fresh — a largar todas as tabelas...')
    await this.kernel.exec('migration:fresh', this.force ? ['--force'] : [])
    this.logger.success('migration:fresh concluída.')

    this.logger.info('db:seed — a semear...')
    await this.kernel.exec('db:seed', [])
    this.logger.success('Seeders executados.')

    /**
     * Confirmar que a sementeira deixou mesmo alguma coisa.
     *
     * Existe porque a falha que motivou este bloco não se parecia com uma falha: o
     * `migration:fresh` dizia "concluída", e só a linha seguinte é que rebentava. Quem
     * lesse a saída depressa via sucesso.
     *
     * As duas contagens não são decorativas — são as duas coisas sem as quais o sistema
     * fica de pé e inutilizável:
     *
     *  - sem papéis de escopo `plataforma`, o `/instalacao` do backoffice aborta e não há
     *    forma de criar a primeira conta;
     *  - sem planos, `planoDeArranque()` não encontra nada, a empresa nasce sem
     *    subscrição em silêncio, e `limites_do_plano.ts` não impõe limite nenhum a quem
     *    não tem plano — ou seja, acesso ilimitado a toda a gente.
     */
    const [papeis, planos] = await Promise.all([
      db.from('papel').where('escopo', 'plataforma').whereNull('deleted_at').count('* as t').first(),
      db.from('plano').count('* as t').first(),
    ])

    const semPapeis = Number(papeis?.t ?? 0) === 0
    const semPlanos = Number(planos?.t ?? 0) === 0

    if (semPapeis || semPlanos) {
      this.logger.error('A base ficou por semear:')
      if (semPapeis) this.logger.error('  - zero papéis de escopo "plataforma"')
      if (semPlanos) this.logger.error('  - zero planos')
      this.logger.error('Corra `node ace db:seed` e volte a verificar.')
      this.exitCode = 1
      return
    }

    this.logger.success(
      `Verificado: ${papeis!.t} papéis de plataforma, ${planos!.t} planos.`
    )

    // Sem try/catch: um erro tem de propagar e sair com código diferente de zero, para
    // quem encadeia comandos parar aqui em vez de continuar sobre uma base meia feita.
    this.logger.info('Processo concluído.')
  }
}
