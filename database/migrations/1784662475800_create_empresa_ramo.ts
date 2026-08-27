import { BaseSchema } from '@adonisjs/lucid/schema'
import { randomUUID } from 'node:crypto'

import { alinharColunaComReferencia, temIndice, temRestricao, temTabela } from '../helpers/esquema.js'

/**
 * Uma empresa pode actuar em mais do que um ramo.
 *
 * `empresa.ramo_actuacao` (migração 799) guardava UM. Não chega: uma farmácia vende
 * também perfumaria e puericultura, um supermercado tem talho e padaria, e uma loja de
 * bairro é meia mercearia e meia papelaria. Obrigar a escolher um só empurra o dono para
 * o ramo "menos errado" e dá-lhe um catálogo de arranque que não descreve o negócio dele.
 *
 * ── Porquê uma tabela, e não uma lista na mesma coluna ─────────────────────────
 *
 * A tentação era gravar `"farmacia,perfumaria"` em `ramo_actuacao` e poupar a migração.
 * Uma lista dentro de uma coluna não tem unicidade (nada impede `farmacia,farmacia`),
 * não se consulta sem `LIKE` (que casa `farmacia` com `farmacia-veterinaria`), e o dia em
 * que um ramo precisar de guardar mais alguma coisa — a data em que foi escolhido, quem
 * o escolheu — não há onde a pôr.
 *
 * ── O que fica em `empresa.ramo_actuacao` ──────────────────────────────────────
 *
 * O ramo PRINCIPAL, isto é, o primeiro que a empresa escolheu. Esta tabela é a fonte da
 * verdade sobre o conjunto; a coluna é o rótulo de uma linha só, e existe porque
 * `api/auth/login` e `auth/me` já o devolvem e há ecrãs que só têm espaço para um nome.
 * É mantida em sintonia por `onboarding_repository.aplicarRamos()` — nunca escrita à mão.
 *
 * ── Sem soft delete ────────────────────────────────────────────────────────────
 *
 * `deleted_at` não existe aqui de propósito. Isto é um conjunto de escolhas, não um
 * registo de negócio: retirar um ramo é retirar a linha. O que foi semeado por causa dele
 * (categorias, produtos) **não** é apagado — ver `aplicarRamos()` —, portanto não há
 * histórico nenhum a perder-se, e um soft delete só serviria para o índice único passar a
 * recusar a reescolha do mesmo ramo mais tarde.
 */
export default class extends BaseSchema {
  protected tableName = 'empresa_ramo'

  /** Re-executável: cada passo pergunta antes de fazer (secção 7.19). */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, 'empresa_ramo'))) {
        // Sem `DEFAULT CHARSET`: declará-lo sem `COLLATE` NÃO herda a collation da base
        // (secção 7.20.2) e a chave estrangeira para `empresa` passa a ser recusada num
        // servidor cuja base foi criada com outra collation. Omitindo ambos, herda os dois.
        await db.rawQuery(`
          CREATE TABLE empresa_ramo (
            id CHAR(36) NOT NULL,
            empresa_id CHAR(36) NOT NULL,
            ramo VARCHAR(64) NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id)
          ) ENGINE=InnoDB
        `)
      }

      // Um ramo por empresa, uma vez. Sem isto, voltar ao passo do onboarding e
      // reconfirmar a mesma escolha acrescentava linhas repetidas.
      if (!(await temIndice(db, 'empresa_ramo', 'empresa_ramo_empresa_id_ramo_unique'))) {
        await db.rawQuery(
          'CREATE UNIQUE INDEX empresa_ramo_empresa_id_ramo_unique ON empresa_ramo (empresa_id, ramo)'
        )
      }

      if (!(await temRestricao(db, 'empresa_ramo', 'empresa_ramo_empresa_id_foreign'))) {
        // Alinhar ANTES de criar a chave — ver `alinharColunaComReferencia` e 7.20.2.
        await alinharColunaComReferencia(db, 'empresa_ramo', 'empresa_id', 'empresa', 'id')

        // CASCADE: as escolhas de uma empresa não sobrevivem à empresa. É o mesmo que
        // `pos`/`produtos` já fazem, e é o que mantém `empresa:clean:expired` a funcionar
        // sem ter de conhecer esta tabela.
        await db.rawQuery(`
          ALTER TABLE empresa_ramo
            ADD CONSTRAINT empresa_ramo_empresa_id_foreign
            FOREIGN KEY (empresa_id) REFERENCES empresa (id) ON DELETE CASCADE
        `)
      }

      // Backfill do que a 799 já gravou.
      //
      // Em duas passagens (ler, depois inserir) e não num `INSERT ... SELECT`, porque os
      // ids têm de ser gerados em Node: o `UUID()` do MySQL produz v1, e este projecto tem
      // validadores e parâmetros de rota que exigem v4 — um id v1 falha validação num
      // sítio difícil de relacionar com a causa (secção 7.13).
      //
      // Reexecutável sem duplicar: só entram as empresas que ainda não têm a linha.
      const [porMigrar] = await db.rawQuery(`
        SELECT e.id AS empresa_id, e.ramo_actuacao AS ramo
          FROM empresa e
         WHERE e.ramo_actuacao IS NOT NULL
           AND e.ramo_actuacao <> ''
           AND NOT EXISTS (
                 SELECT 1 FROM empresa_ramo er
                  WHERE er.empresa_id = e.id AND er.ramo = e.ramo_actuacao
               )
      `)

      const linhas = porMigrar as { empresa_id: string; ramo: string }[]
      if (linhas.length > 0) {
        const agora = new Date()
        await db.table('empresa_ramo').multiInsert(
          linhas.map((l) => ({
            id: randomUUID(),
            empresa_id: l.empresa_id,
            ramo: l.ramo,
            created_at: agora,
            updated_at: agora,
          }))
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temRestricao(db, 'empresa_ramo', 'empresa_ramo_empresa_id_foreign')) {
        await db.rawQuery('ALTER TABLE empresa_ramo DROP FOREIGN KEY empresa_ramo_empresa_id_foreign')
      }

      if (await temTabela(db, 'empresa_ramo')) {
        await db.rawQuery('DROP TABLE empresa_ramo')
      }
    })
  }
}
