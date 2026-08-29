import { BaseCommand, flags } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'
import { readdir } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'

/**
 * Regista as migrations como aplicadas SEM as executar.
 *
 * ── Porque isto tem de existir ────────────────────────────────────────────────
 *
 * As 125 migrations originais foram consolidadas em 56 (uma por tabela). Numa base
 * VAZIA isso não tem consequência nenhuma: `migration:fresh` corre as 56 e produz
 * exactamente o mesmo schema — está verificado, coluna a coluna, índice a índice.
 *
 * O problema é a base que JÁ TEM as tabelas. Produção correu as 125 antigas e tem os
 * nomes delas em `adonis_schema`. Nenhum desses nomes existe agora, por isso o
 * próximo `migration:run` vê 56 migrations por aplicar e tenta criar 55 tabelas que
 * já lá estão. Rebenta ao primeiro `CREATE TABLE`, e rebenta a meio: algumas linhas
 * novas em `adonis_schema`, nada feito no schema, e a base num estado que ninguém
 * planeou.
 *
 * Este comando resolve isso da única forma correcta: escreve os nomes novos em
 * `adonis_schema` a dizer "isto já cá está", e não toca numa única tabela.
 *
 * ── Quando usar ──────────────────────────────────────────────────────────────
 *
 *   Base VAZIA (a QA depois do reset)  ->  `migration:fresh`. NÃO uses este comando.
 *   Base COM o schema antigo (produção) ->  este comando, UMA vez, no deploy que
 *                                           traz a consolidação.
 *
 * Usar isto numa base a que falte mesmo uma tabela é pior do que não fazer nada:
 * marca como feito o que não foi, e a tabela em falta deixa de ter quem a crie. Por
 * isso o comando VERIFICA primeiro que todas as tabelas esperadas existem, e recusa-se
 * a correr se faltar alguma. `--dry-run` mostra o que faria sem escrever nada.
 */
export default class MigrationBaseline extends BaseCommand {
  static commandName = 'migration:baseline'
  static description =
    'Marca as migrations actuais como aplicadas sem as executar (para bases que já têm o schema)'

  static options = { startApp: true }

  @flags.boolean({ description: 'Mostra o que faria, sem escrever nada', default: false })
  declare dryRun: boolean

  @flags.boolean({
    description: 'Regista mesmo que falte alguma tabela esperada (perigoso — ver a documentação)',
    default: false,
  })
  declare force: boolean

  /**
   * Depois do baseline, os 125 nomes antigos ficam em `adonis_schema` sem ficheiro
   * correspondente, e o `migration:status` mostra-os como `corrupt — file missing`.
   * É só cosmético: está verificado que `migration:run` e `migration:rollback`
   * continuam a funcionar com eles lá. Mas 125 linhas vermelhas num ecrã de produção
   * fazem alguém pensar que a base está partida, e às três da manhã isso custa caro.
   *
   * Fica DESLIGADO por omissão de propósito: enquanto as linhas antigas lá estiverem,
   * repor a versão anterior do código é um `git revert` e mais nada — o registo dela
   * ainda bate certo com os ficheiros dela. Apagá-las fecha essa porta. Corre isto
   * numa segunda passagem, quando o deploy já estiver assente.
   */
  @flags.boolean({
    description: 'Apaga do registo as migrations cujo ficheiro já não existe (correr só depois do deploy assentar)',
    default: false,
    flagName: 'limpar-orfas',
  })
  declare limparOrfas: boolean

  async run() {
    const caminho = app.makePath('database/migrations')
    const ficheiros = (await readdir(caminho))
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .map((f) => f.replace(/\.(ts|js)$/, ''))
      // A mesma ordenação natural que `config/database.ts` pede ao Lucid
      // (`naturalSort: true`): sem isto, "1790000000100" viria antes de
      // "1790000000020" e o registo ficava com uma ordem que não é a real.
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map((f) => `database/migrations/${f}`)

    if (ficheiros.length === 0) {
      this.logger.error('Não há migrations em database/migrations.')
      this.exitCode = 1
      return
    }

    const existentes = new Set<string>(
      (await db.from('adonis_schema').select('name')).map((r: { name: string }) => r.name)
    )
    const emFalta = ficheiros.filter((f) => !existentes.has(f))
    const noDisco = new Set(ficheiros)
    const orfas = [...existentes].filter((n) => !noDisco.has(n))

    if (this.limparOrfas) {
      if (orfas.length === 0) {
        this.logger.info('Não há registos órfãos para apagar.')
      } else if (this.dryRun) {
        this.logger.info(`--dry-run: apagaria ${orfas.length} registos órfãos do histórico.`)
      } else {
        await db.from('adonis_schema').whereIn('name', orfas).delete()
        this.logger.success(`${orfas.length} registos órfãos apagados. O schema não foi alterado.`)
      }
    }

    if (emFalta.length === 0) {
      this.logger.info(`Nada a fazer: as ${ficheiros.length} migrations já estão registadas.`)
      if (orfas.length > 0 && !this.limparOrfas) {
        this.logger.info(
          `Nota: ${orfas.length} registos sem ficheiro (aparecem como "corrupt" no migration:status). ` +
            'São inofensivos; `--limpar-orfas` remove-os quando o deploy estiver assente.'
        )
      }
      return
    }

    // ── A verificação que impede o engano caro ────────────────────────────────
    // O nome do ficheiro diz que tabela cria (`..._create_<tabela>_table`). Se
    // alguma dessas tabelas não existir, esta base NÃO tem o schema completo e
    // marcá-la como migrada esconderia o buraco em vez de o tapar.
    const conexao = db.connection()
    const esperadas = emFalta
      .map((f) => f.match(/_create_(.+)_table$/)?.[1])
      .filter((t): t is string => Boolean(t))

    const ausentes: string[] = []
    for (const tabela of esperadas) {
      if (!(await conexao.schema.hasTable(tabela))) ausentes.push(tabela)
    }

    if (ausentes.length > 0 && !this.force) {
      this.logger.error(
        `Esta base não tem ${ausentes.length} das tabelas que estas migrations criam: ${ausentes.join(', ')}.`
      )
      this.logger.info(
        'Numa base vazia usa `node ace migration:fresh`. Este comando é só para bases que já têm o schema completo.'
      )
      this.exitCode = 1
      return
    }
    if (ausentes.length > 0) {
      this.logger.warning(`--force: a registar apesar de faltarem ${ausentes.length} tabelas.`)
    }

    if (this.dryRun) {
      this.logger.info(`--dry-run: registaria ${emFalta.length} migrations, sem tocar no schema:`)
      for (const f of emFalta) this.logger.info(`  ${f}`)
      return
    }

    // Tudo num lote novo, para que um `migration:rollback` reverta a consolidação
    // como um todo e não migration a migration.
    const [{ maximo }] = await db.from('adonis_schema').max('batch as maximo')
    const lote = Number(maximo ?? 0) + 1
    const agora = new Date()

    await db.transaction(async (trx) => {
      await trx.table('adonis_schema').multiInsert(
        emFalta.map((name) => ({ name, batch: lote, migration_time: agora }))
      )
    })

    this.logger.success(
      `${emFalta.length} migrations registadas como aplicadas (lote ${lote}). O schema não foi alterado.`
    )
    this.logger.info('Confirma com `node ace migration:status` — deve ficar tudo em "migrated".')
  }
}
