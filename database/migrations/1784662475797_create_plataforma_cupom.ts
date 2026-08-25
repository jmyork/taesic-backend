import { BaseSchema } from '@adonisjs/lucid/schema'

import { temIndice, temRestricao, temTabela } from '../helpers/esquema.js'

/**
 * Cupões de PLATAFORMA — as duas tabelas que faltavam.
 *
 * ── O que existia, e porque não servia ─────────────────────────────────────────
 *
 * A tabela `cupom` é dos INQUILINOS: tem `empresa_id`, e `cupom_id` só aparece em
 * `vendas`. Um cupão de lá desconta um produto vendido dentro de uma empresa, e o
 * painel do promotor calcula ganhos por `vendas` → `cupom` → `empresa`.
 *
 * O que o dono do produto descreveu é outra coisa: **pessoas que promovem a
 * PLATAFORMA e ganham sobre a venda de assinaturas aos planos da plataforma.**
 * Isso não tinha onde existir — `subscricao` e `cobranca` não tinham ligação
 * nenhuma a cupões. Era por isso que a rota `platform_cupom` no `taesic-backend`
 * estava assinalada como premissa por confirmar: era CRUD cross-tenant sobre os
 * cupões dos inquilinos, com o nome de uma funcionalidade que não existia.
 *
 * ── O que se cria ──────────────────────────────────────────────────────────────
 *
 *   plataforma_cupom       o cupão: código, promotor, desconto, comissão, limites
 *   plataforma_cupom_uso   o livro de resgates: uma linha por subscrição ganha
 *
 * O promotor é uma linha de `promotor` com `empresa_id IS NULL` — o promotor de
 * plataforma já existe no esquema (tem até auto-registo público em
 * `api/promotores/registo`) e tem o getter `isPlataforma`. Não se inventa conceito
 * novo: dá-se-lhe finalmente algo que ele possa promover.
 *
 * ── Porque é que a migração nasce AQUI e não no backoffice ─────────────────────
 *
 * As duas tabelas servem o `taesic-backoffice-api`, mas o dono do esquema é este
 * projecto — e os dois apontam para uma base de dados só. Dois projectos a correr
 * migrações contra a mesma base partilhariam a tabela `adonis_schema`: os lotes
 * (`batch`) intercalavam-se, e um `migration:rollback` de um lado desfazia
 * trabalho do outro sem aviso nenhum. O backoffice continua sem `database/`.
 *
 * ── Porque é que os valores ficam CONGELADOS no resgate ────────────────────────
 *
 * `valor_base`, `valor_desconto` e `valor_comissao` são gravados na linha de uso,
 * em vez de recalculados a partir do plano e das percentagens do cupão. Um plano
 * muda de preço, uma percentagem é corrigida — e o que já foi ganho não pode
 * mudar retroactivamente. Uma comissão é uma dívida a alguém; recalculá-la a cada
 * leitura seria reescrever a história de quanto se deve.
 *
 * ── Idempotente ────────────────────────────────────────────────────────────────
 *
 * Regra do CLAUDE.md §7.19: o DDL do MySQL não é transaccional, portanto cada
 * passo pergunta primeiro se já está feito. Uma migração interrompida a meio é
 * recuperada pela própria reexecução.
 *
 * E nada de funcionalidades específicas de um motor (§7.19.1): sem colunas
 * geradas, sem índices funcionais. Só tabelas, chaves estrangeiras e índices
 * comuns — o servidor não corre o mesmo motor que o ambiente de desenvolvimento.
 */
export default class extends BaseSchema {
  protected tableName = 'plataforma_cupom'

  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, 'plataforma_cupom'))) {
        await db.rawQuery(`
          CREATE TABLE plataforma_cupom (
            id CHAR(36) NOT NULL,
            codigo VARCHAR(32) NOT NULL,
            promotor_id CHAR(36) NOT NULL,
            descricao VARCHAR(255) NULL,
            desconto_percentagem DECIMAL(5,2) NOT NULL DEFAULT 0,
            comissao_percentagem DECIMAL(5,2) NOT NULL DEFAULT 0,
            validade DATETIME NULL,
            limite_utilizacoes INT UNSIGNED NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            deleted_at DATETIME NULL,
            PRIMARY KEY (id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `)
      }

      /**
       * O código é único na tabela INTEIRA, apagados incluídos.
       *
       * É o contrário do que se fez em `papel_escopo_nome_unique`, e de propósito:
       * um código de cupão é partilhado com o mundo (redes sociais, um cartaz, um
       * link). Reatribuir a outro promotor um código que já circulou faria a
       * comissão de uma campanha antiga cair no bolso de outra pessoa. Um cupão
       * apagado com soft delete guarda o código para sempre.
       */
      if (!(await temIndice(db, 'plataforma_cupom', 'plataforma_cupom_codigo_unique'))) {
        await db.rawQuery(
          'CREATE UNIQUE INDEX plataforma_cupom_codigo_unique ON plataforma_cupom (codigo)'
        )
      }

      if (!(await temRestricao(db, 'plataforma_cupom', 'plataforma_cupom_promotor_id_foreign'))) {
        await db.rawQuery(`
          ALTER TABLE plataforma_cupom
            ADD CONSTRAINT plataforma_cupom_promotor_id_foreign
            FOREIGN KEY (promotor_id) REFERENCES promotor (id)
        `)
      }

      /**
       * As percentagens têm de ser percentagens.
       *
       * A validação do VineJS protege a ROTA; isto protege a TABELA, que é escrita
       * por dois projectos, pelos seeders e por SQL à mão. Uma comissão de 5000%
       * gravada por um caminho sem validador não é um número errado num ecrã — é
       * uma dívida errada a uma pessoa real.
       */
      if (!(await temRestricao(db, 'plataforma_cupom', 'plataforma_cupom_percentagens_chk'))) {
        await db.rawQuery(`
          ALTER TABLE plataforma_cupom
            ADD CONSTRAINT plataforma_cupom_percentagens_chk CHECK (
              desconto_percentagem >= 0 AND desconto_percentagem <= 100
              AND comissao_percentagem >= 0 AND comissao_percentagem <= 100
            )
        `)
      }

      if (!(await temTabela(db, 'plataforma_cupom_uso'))) {
        await db.rawQuery(`
          CREATE TABLE plataforma_cupom_uso (
            id CHAR(36) NOT NULL,
            cupom_id CHAR(36) NOT NULL,
            subscricao_id CHAR(36) NOT NULL,
            empresa_id CHAR(36) NOT NULL,
            valor_base DECIMAL(12,2) NOT NULL DEFAULT 0,
            valor_desconto DECIMAL(12,2) NOT NULL DEFAULT 0,
            valor_comissao DECIMAL(12,2) NOT NULL DEFAULT 0,
            moeda VARCHAR(8) NOT NULL DEFAULT 'AOA',
            registado_por CHAR(36) NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            deleted_at DATETIME NULL,
            PRIMARY KEY (id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `)
      }

      /**
       * Uma subscrição é ganha UMA vez.
       *
       * Sem este índice, dois pedidos concorrentes (ou dois cliques) atribuíam a
       * mesma subscrição a dois cupões, e a plataforma passava a dever a mesma
       * comissão duas vezes. A verificação em código não chega: entre o SELECT e o
       * INSERT cabe o outro pedido. Também aqui sem `deleted_at`, pela razão
       * habitual — no MySQL os NULL contam como distintos, portanto incluí-lo
       * deixava passar dois resgates ACTIVOS da mesma subscrição.
       */
      if (
        !(await temIndice(db, 'plataforma_cupom_uso', 'plataforma_cupom_uso_subscricao_unique'))
      ) {
        await db.rawQuery(
          'CREATE UNIQUE INDEX plataforma_cupom_uso_subscricao_unique ON plataforma_cupom_uso (subscricao_id)'
        )
      }

      // O índice que a listagem e os totais por cupão percorrem.
      if (!(await temIndice(db, 'plataforma_cupom_uso', 'plataforma_cupom_uso_cupom_id_index'))) {
        await db.rawQuery(
          'CREATE INDEX plataforma_cupom_uso_cupom_id_index ON plataforma_cupom_uso (cupom_id)'
        )
      }

      const chaves: [string, string, string][] = [
        ['plataforma_cupom_uso_cupom_id_foreign', 'cupom_id', 'plataforma_cupom'],
        ['plataforma_cupom_uso_subscricao_id_foreign', 'subscricao_id', 'subscricao'],
        ['plataforma_cupom_uso_empresa_id_foreign', 'empresa_id', 'empresa'],
        ['plataforma_cupom_uso_registado_por_foreign', 'registado_por', 'user'],
      ]

      for (const [nome, coluna, referencia] of chaves) {
        if (!(await temRestricao(db, 'plataforma_cupom_uso', nome))) {
          await db.rawQuery(`
            ALTER TABLE plataforma_cupom_uso
              ADD CONSTRAINT ${nome}
              FOREIGN KEY (${coluna}) REFERENCES ${referencia} (id)
          `)
        }
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      // Pela ordem inversa: `plataforma_cupom_uso` aponta para `plataforma_cupom`.
      if (await temTabela(db, 'plataforma_cupom_uso')) {
        await db.rawQuery('DROP TABLE plataforma_cupom_uso')
      }
      if (await temTabela(db, 'plataforma_cupom')) {
        await db.rawQuery('DROP TABLE plataforma_cupom')
      }
    })
  }
}
