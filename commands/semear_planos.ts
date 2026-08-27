import { BaseCommand } from '@adonisjs/core/ace'
import { PLANOS_PADRAO, semearPlanosPadrao } from '../app/helpers/planos_padrao.js'

/**
 * Cria os planos de subscrição em falta.
 *
 * Existe porque `database_seeder.ts` **não é idempotente** (`Users.createMany` rebenta com
 * emails duplicados numa segunda corrida), portanto não serve para levar planos a uma base
 * que já tem dados — que é o caso de qualquer ambiente a sério.
 *
 * Idempotente por `slug`, e **não sobrepõe** o que já existe: um preço afinado no
 * backoffice não pode ser revertido pelo próximo deploy.
 */
export default class SemearPlanos extends BaseCommand {
  static commandName = 'planos:semear'
  static description = 'Cria os planos de subscrição por omissão que ainda não existam'
  static options = { startApp: true }

  async run() {
    const criados = await semearPlanosPadrao()

    if (criados.length === 0) {
      this.logger.info(
        `Nada a fazer: os ${PLANOS_PADRAO.length} planos por omissão já existem.`
      )
      return
    }

    for (const plano of criados) {
      this.logger.success(`Plano criado: ${plano.nome} (${plano.slug}) — ${plano.preco} ${plano.moeda}`)
    }

    this.logger.info(`${criados.length} plano(s) criado(s).`)
  }
}
