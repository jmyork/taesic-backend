import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'
import { CONDICOES_DE_PAGAMENTO } from '../../app/helpers/regras_de_emissao.js'

export default class extends BaseSchema {
  protected tableName = 'vendas'

  /**
   * Re-executável: cada passo pergunta antes de fazer. Ver
   * `database/helpers/esquema.ts` para o porquê de isto não ser opcional — o MySQL
   * não faz DDL transaccional, portanto uma migração que falhe a meio deixa o
   * esquema meio alterado E por registar, e a corrida seguinte bate na mesma
   * instrução para sempre.
   */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()
          table.uuid('caixa_id').nullable()
          table.decimal('total', 22, 2).notNullable().defaultTo(0.00)
          table.enum('status', ['aberta', 'fechada', 'cancelada', 'reembolsada', 'proforma']).notNullable().defaultTo('aberta')
          table.string('motivo_cancelamento', 255).nullable()
          table.string('motivo_reembolso', 255).nullable()
          table.enum('venda_tipo', ['presencial', 'online', 'online_loja']).nullable()

          /**
           * Como é que esta venda é paga — o campo de onde sai o documento fiscal.
           *
           * ── O que a venda não sabia ────────────────────────────────────────
           *
           * Sabia o QUE foi vendido e por quanto, e nada sobre a relação de
           * pagamento. `close()` exigia sempre o dinheiro todo, o stock saía
           * sempre, e o documento fiscal era emitido **depois, noutro ecrã, à
           * mão**, por quem se lembrasse. Uma venda a prazo não tinha como ser
           * registada; um adiantamento também não; e nenhuma venda emitia nada.
           *
           * Desta coluna saem quatro respostas de uma vez —
           * `REGRAS_DA_CONDICAO` em `app/helpers/regras_de_emissao.ts` tem-nas
           * todas, juntas de propósito, porque têm de concordar entre si:
           *
           *     condição            pagamento    stock sai   documento              receita
           *     ─────────────────   ──────────   ─────────   ────────────────────   ───────
           *     pronto_pagamento    obrigatório  sim         Factura-Recibo,        sim
           *                                                  ou Genérica sem NIF
           *     credito             recusado     sim         Factura (com prazo)    sim
           *     adiantamento        obrigatório  NÃO         Factura de             NÃO
           *                                                  Adiantamento
           *
           * A linha do adiantamento é a que muda o cálculo dos ganhos: é a única
           * entrada de dinheiro deste sistema que **não** é receita, porque ainda
           * não houve entrega. O ganho reconhece-se quando o produto sai
           * (`vendas_repository.entregar()`), e é aí que o stock também sai.
           *
           * `pronto_pagamento` por omissão (regra 7.20): descreve com exactidão
           * tudo o que este sistema fez até aqui, porque era a única coisa que
           * permitia.
           */
          table
            .enum('condicao_pagamento', CONDICOES_DE_PAGAMENTO)
            .notNullable()
            .defaultTo('pronto_pagamento')

          /**
           * O prazo acordado, em dias — só nas vendas a crédito.
           *
           * Congelado no fecho, e não lido de `empresa.prazo_pagamento_dias`
           * quando é preciso: essa é uma preferência que muda, e uma venda a 30
           * dias não passa a ser a 15 porque a empresa mudou de política depois.
           * É a mesma razão pela qual o nome e o NIF do cliente são COPIADOS para
           * a factura em vez de resolvidos por chave estrangeira.
           */
          table.smallint('prazo_pagamento_dias').unsigned().nullable()

          /**
           * Quando o produto de um adiantamento saiu efectivamente.
           *
           * É o que distingue um adiantamento por cumprir de um já cumprido, e é o
           * momento em que o stock sai e a receita é reconhecida. Nula em tudo o
           * resto — nas outras condições a entrega é o próprio fecho da venda.
           */
          table.timestamp('entregue_em').nullable()
          table.uuid('cliente_online_id').nullable()
          table.uuid('cliente_presencial_id').nullable()
          table.uuid('cupom_id').nullable()
          table.decimal('valor_desconto', 22, 2).notNullable().defaultTo(0.00)
          table.uuid('empresa_id').nullable()
          table.integer('numero').nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'vendas_deleted_at_index')
          table.unique(['empresa_id', 'numero'], { indexName: 'vendas_empresa_id_numero_unique' })
          table
            .foreign(['caixa_id'], 'vendas_caixa_id_foreign')
            .references(['id'])
            .inTable('caixa')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['cliente_online_id'], 'vendas_cliente_online_id_foreign')
            .references(['id'])
            .inTable('user')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['cliente_presencial_id'], 'vendas_cliente_presencial_id_foreign')
            .references(['id'])
            .inTable('cliente')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['cupom_id'], 'vendas_cupom_id_foreign')
            .references(['id'])
            .inTable('cupom')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['empresa_id'], 'vendas_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
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
