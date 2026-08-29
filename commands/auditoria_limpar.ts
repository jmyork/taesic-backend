import { BaseCommand, flags } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'

/**
 * Apaga registos de actividade antigos.
 *
 * ── Porque é que isto é necessário ────────────────────────────────────────────
 *
 * Com `AUDITORIA_CAPTURA=completo` (o valor por omissão), **cada chamada à API deixa
 * uma linha** — incluindo as leituras, e com o corpo da resposta. Um catálogo de
 * produtos consultado ao segundo enche a tabela muito mais depressa do que qualquer
 * tabela de negócio. Sem uma poda, o crescimento é indefinido e o primeiro sintoma é
 * o disco do servidor, não um erro.
 *
 * Não há retenção automática de propósito: quanto tempo se guarda um registo de
 * auditoria é uma decisão de negócio (e por vezes legal), não técnica. Isto dá a
 * ferramenta; o prazo e a periodicidade são de quem os decide, por cron, como
 * `empresa:clean:expired` e `estoque:check-alertas`.
 *
 * ── Limitado por `id` E por data, não só por `id` ────────────────────────────
 *
 * O `id` é sequencial e é a chave primária, portanto um limite superior de `id` faz o
 * motor apagar um intervalo contíguo do índice agrupado — em milhões de linhas, é a
 * diferença entre segundos e minutos com a tabela bloqueada.
 *
 * Mas o `id` sozinho NÃO é suficiente, e isto foi apanhado por um teste que apagou
 * linhas recentes: o limite é "o maior id anterior ao corte", o que só equivale a "tudo
 * o que é antigo" enquanto a ordem dos ids acompanhar a das datas. Numa tabela
 * append-only isso é verdade — mas basta uma importação, um restauro parcial ou uma
 * linha com data recuada para deixar de ser, e o que se perde nesse caso é
 * precisamente o registo mais recente.
 *
 * Por isso o `DELETE` leva as duas condições: o `id` para ser rápido, a data para
 * estar certo. Uma tabela de auditoria que apaga o que não devia é pior do que uma
 * tabela grande.
 *
 * ── Em lotes ─────────────────────────────────────────────────────────────────
 *
 * Um `DELETE` de milhões de linhas numa só transacção enche o log de refazer e
 * bloqueia a tabela durante todo o tempo — numa tabela em que a aplicação escreve a
 * cada pedido. Lotes pequenos deixam as escritas passar pelo meio.
 */
export default class AuditoriaLimpar extends BaseCommand {
  static commandName = 'auditoria:limpar'
  static description = 'Apaga registos de actividade mais antigos do que N dias'
  static options = { startApp: true }

  @flags.number({ description: 'Guardar os últimos N dias', default: 90 })
  declare dias: number

  @flags.number({ description: 'Linhas por lote', default: 5_000 })
  declare lote: number

  @flags.boolean({ description: 'Mostra quanto apagaria, sem apagar nada', default: false })
  declare dryRun: boolean

  async run() {
    if (!Number.isInteger(this.dias) || this.dias < 1) {
      this.logger.error('--dias tem de ser um inteiro >= 1.')
      this.exitCode = 1
      return
    }

    const corte = new Date(Date.now() - this.dias * 24 * 60 * 60 * 1000)

    // O maior `id` anterior ao corte — serve de limite RÁPIDO. A correcção vem da
    // condição de data que o acompanha no DELETE (ver o comentário no topo).
    const limite = await db
      .from('activity_logs')
      .where('created_at', '<', corte)
      .max('id as maximo')
      .first()

    const idLimite = Number(limite?.maximo ?? 0)
    if (!idLimite) {
      this.logger.info(`Nada a apagar: não há registos anteriores a ${corte.toISOString()}.`)
      return
    }

    const [{ total }] = await db
      .from('activity_logs')
      .where('id', '<=', idLimite)
      .where('created_at', '<', corte)
      .count('* as total')

    const quantos = Number(total ?? 0)

    if (this.dryRun) {
      this.logger.info(
        `--dry-run: apagaria ${quantos} registos (id <= ${idLimite}, anteriores a ${corte.toISOString()}).`
      )
      return
    }

    let apagados = 0
    for (;;) {
      const resultado = await db
        .from('activity_logs')
        .where('id', '<=', idLimite)
        // A data também, e não só o id — ver o comentário no topo. É esta linha que
        // impede a poda de levar registos recentes quando a ordem dos ids não
        // acompanha a das datas.
        .where('created_at', '<', corte)
        .limit(this.lote)
        .delete()

      // O driver devolve o número de linhas afectadas, mas embrulhado em array em
      // alguns caminhos do knex/mysql2. Sem normalizar, `n === 0` nunca era verdadeiro
      // e o ciclo não tinha fim.
      const n = Number(Array.isArray(resultado) ? resultado[0] : resultado) || 0

      if (n === 0) break
      apagados += n
      // Uma pausa curta entre lotes: dá espaço às escritas da aplicação, que nesta
      // tabela acontecem a cada pedido.
      await new Promise((r) => setTimeout(r, 50))
    }

    this.logger.success(`${apagados} registos de actividade apagados (mantidos os últimos ${this.dias} dias).`)
  }
}
