import { BaseCommand } from '@adonisjs/core/ace'
import { semearRbacPadrao, PAPEIS_PADRAO, PERMISSOES_PADRAO } from '../app/helpers/rbac_padrao.js'

/**
 * Acrescenta os papéis, permissões e ligações do catálogo que ainda não existam.
 *
 * Existe porque `database_seeder.ts` **não é idempotente** (`Users.createMany` rebenta
 * com emails repetidos numa segunda corrida), e portanto nunca serviu para levar uma
 * permissão nova a uma base que já tem dados — que é o caso de qualquer ambiente a
 * sério. Até aqui o caminho era `node ace permissao:conceder`, uma permissão de cada
 * vez, com alguém a ter de saber quais tinham sido acrescentadas.
 *
 * É o comando a correr no deploy que traz permissões novas. Só ACRESCENTA: não apaga
 * papéis, não apaga ligações e não reescreve descrições, portanto um papel afinado no
 * backoffice não é revertido pelo deploy seguinte.
 *
 * ⚠️ Não chega aos papéis das EMPRESAS. Cada empresa tem a sua cópia dos modelos,
 * feita no registo; este comando mexe nos modelos, e os modelos só são lidos quando
 * uma empresa nova nasce. Para alcançar as empresas que já existem:
 *
 *     node ace permissao:conceder <permissao> <papel> --todas-empresas
 */
export default class SemearRbac extends BaseCommand {
  static commandName = 'rbac:semear'
  static description = 'Cria os papéis, permissões e ligações por omissão que ainda não existam'
  static options = { startApp: true }

  async run() {
    const resumo = await semearRbacPadrao()

    if (resumo.papeis === 0 && resumo.permissoes === 0 && resumo.ligacoes === 0) {
      this.logger.info(
        `Nada a fazer: os ${PAPEIS_PADRAO.length} papéis e as ${PERMISSOES_PADRAO.length} permissões por omissão já existem, com as ligações todas.`
      )
      return
    }

    if (resumo.permissoes > 0) this.logger.success(`${resumo.permissoes} permissões criadas.`)
    if (resumo.papeis > 0) this.logger.success(`${resumo.papeis} papéis criados.`)
    if (resumo.ligacoes > 0)
      this.logger.success(`${resumo.ligacoes} ligações papel→permissão criadas.`)

    if (resumo.papeis > 0 || resumo.ligacoes > 0) {
      this.logger.info(
        'Lembrete: isto mexeu nos MODELOS. As empresas já existentes têm cópias próprias e não foram alteradas — ' +
          'usa `node ace permissao:conceder <permissao> <papel> --todas-empresas` para lá chegar.'
      )
    }
  }
}
