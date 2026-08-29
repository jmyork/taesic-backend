import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

/**
 * O registo do que se faz no sistema — quem, o quê, sobre que registo, e o que mudou.
 *
 * ── Porque não chega o que já existe ──────────────────────────────────────────
 *
 * `security_logs` guarda EVENTOS DE SEGURANÇA: logins, autorizações negadas, rate
 * limiting. Responde a "andaram a tentar entrar?". Não responde a "quem apagou este
 * produto?" nem a "que preço é que este artigo tinha na semana passada" — e são estas
 * as perguntas que aparecem quando um cliente reclama de uma factura ou quando uma
 * quantidade de stock não bate certo.
 *
 * As duas tabelas ficam separadas de propósito. Têm ritmos de escrita muito
 * diferentes (um login por sessão contra uma linha por escrita de negócio), políticas
 * de retenção diferentes, e quem investiga um incidente de segurança não quer o ruído
 * de mil actualizações de stock pelo meio.
 *
 * ── O que é `subject_type` / `subject_id` ─────────────────────────────────────
 *
 * Uma referência polimórfica: a tabela afectada e a chave da linha. **Sem chave
 * estrangeira**, e isso é deliberado — o registo tem de sobreviver ao apagar do
 * registo que descreve. Uma FK com `ON DELETE CASCADE` apagaria precisamente a linha
 * de auditoria do momento em que alguém apagou alguma coisa, que é a que mais
 * interessa; com `RESTRICT`, a auditoria impediria apagar o que quer que fosse.
 *
 * ── `empresa_id` ─────────────────────────────────────────────────────────────
 *
 * Anulável: há acções sem empresa (registo de uma empresa nova, acções de
 * plataforma, rotinas automáticas). Indexado porque é por aí que a consulta filtra —
 * cada empresa vê o SEU rasto e mais nenhum.
 */
export default class extends BaseSchema {
  protected tableName = 'activity_logs'

  /** Re-executável, como todas as outras — ver database/helpers/esquema.ts. */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          // ── Chave AUTO-INCREMENT, e não um UUID como no resto do projecto ─────
          //
          // As entidades de negócio usam UUID de propósito (um id sequencial numa
          // URL deixa adivinhar o vizinho e contar o negócio alheio). Aqui nada
          // disso se aplica — o id não vai numa rota, e em troca dá duas coisas que
          // um UUID não dá:
          //
          //   1. **Ordem.** `created_at` é `TIMESTAMP`, com precisão de SEGUNDO:
          //      duas acções no mesmo segundo ficam sem ordem definida, e um
          //      registo de auditoria que não sabe dizer o que veio primeiro falha
          //      exactamente na pergunta que se lhe faz. `ORDER BY id DESC` é a
          //      ordem de inserção, sempre.
          //   2. **Escrita.** Isto é uma tabela append-only, com uma linha por cada
          //      escrita da API. UUIDs v4 entram em pontos aleatórios do índice
          //      agrupado e fragmentam-no; um sequencial acrescenta sempre no fim.
          table.bigIncrements('id')

          // Quem. Anulável: uma rotina de cobrança ou um comando ace não têm actor.
          // Sem FK, pela mesma razão de `subject_*`: apagar um funcionário não pode
          // apagar o rasto do que ele fez.
          table.uuid('user_id').nullable()
          table.string('user_email', 254).nullable()

          table.uuid('empresa_id').nullable()

          // O quê. `create`/`update`/`delete`/`login`/`error`, e os nomes de negócio
          // que os controllers usarem (`venda.fechar`, `caixa.abrir`).
          table.string('action', 100).notNullable()

          table.string('subject_type', 100).nullable()
          table.string('subject_id', 64).nullable()

          // O que mudou: `{ antes: {...}, depois: {...} }`, só os campos que mudaram.
          // `longtext` e não uma coluna `json` nativa — a mesma escolha de
          // `security_logs.details`: mais portátil, e sem depender do auto-parse do
          // driver, que já mordeu este projecto noutros sítios.
          table.text('changes', 'longtext').nullable()

          table.string('description', 500).nullable()

          // O pedido que a originou, para ligar uma linha a um acesso do servidor web.
          table.string('ip_address', 45).nullable()
          table.string('method', 10).nullable()
          table.string('route', 255).nullable()
          table.integer('status_code').nullable()

          table.timestamp('created_at').notNullable().defaultTo(this.now())

          // Os três acessos que a consulta faz: "o que se passou nesta empresa",
          // "o histórico deste registo", "o que esta pessoa andou a fazer". Compostos
          // com `id` e não com `created_at` porque é por `id` que se ordena (ver
          // acima) — um índice que termine noutra coluna obrigaria o motor a ordenar
          // o resultado inteiro em memória.
          table.index(['empresa_id', 'id'], 'activity_logs_empresa_id_index')
          table.index(['subject_type', 'subject_id'], 'activity_logs_subject_index')
          table.index(['user_id', 'id'], 'activity_logs_user_id_index')
          table.index(['action'], 'activity_logs_action_index')
        })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temTabela(db, this.tableName)) {
        await db.schema.dropTable(this.tableName)
      }
    })
  }
}
