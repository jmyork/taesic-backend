import { BaseSchema } from '@adonisjs/lucid/schema'

import { temColuna, temIndice, temRestricao } from '../helpers/esquema.js'

/**
 * Suspender uma empresa passa a ser possível — e a significar alguma coisa.
 *
 * Até aqui não havia forma de cortar o acesso a um inquilino. `ValidateCompanyAlias
 * Middleware` verificava o alias, o dono e o `verified`, e mais nada. Um botão
 * "suspender" no backoffice seria decorativo: uma empresa comprometida, em dívida,
 * ou registada com o NIF de outra pessoa continuava a facturar até alguém ir à
 * base de dados à mão.
 *
 * ── Porquê colunas novas, e não `status`/`inadiplente` ─────────────────────────
 *
 * As duas já existem e é precisamente esse o problema: são booleans sem semântica
 * escrita em lado nenhum. `status` significa "activa"? "aprovada"? "a pagar"?
 * Ninguém sabe, e há 2 empresas em dev e um número desconhecido em produção com
 * valores gravados sob a interpretação de quem os escreveu na altura. Dar-lhes
 * agora um significado numa FRONTEIRA DE ACESSO seria decidir, retroactivamente,
 * quem fica de fora — a partir de dados que nunca quiseram dizer isso.
 *
 * `suspensa_em` não tem esse passado. NULL é "não suspensa" para toda a gente,
 * incluindo para as linhas que já existem, e nenhum comportamento actual muda de
 * sentido por baixo de código que já depende de `status`/`inadiplente`.
 *
 * ── O invariante ───────────────────────────────────────────────────────────────
 *
 * Uma suspensão sem motivo é uma suspensão que ninguém consegue explicar nem
 * reverter com confiança três meses depois. O CHECK garante que as duas colunas
 * andam juntas: ou a empresa está activa (tudo NULL), ou está suspensa e há um
 * motivo gravado. `suspensa_por` fica de fora do invariante de propósito — uma
 * suspensão feita por um comando ace ou por uma rotina automática não tem
 * utilizador para apontar, e recusá-la por isso seria pior.
 */
export default class extends BaseSchema {
  protected tableName = 'empresa'

  /** Re-executável: cada passo pergunta antes de fazer. Ver
   *  `database/helpers/esquema.ts` para o porquê de isto não ser opcional. */
  async up() {
    this.defer(async (db) => {
      if (!(await temColuna(db, 'empresa', 'suspensa_em'))) {
        await db.rawQuery('ALTER TABLE empresa ADD COLUMN suspensa_em TIMESTAMP NULL')
      }

      if (!(await temIndice(db, 'empresa', 'empresa_suspensa_em_index'))) {
        await db.rawQuery('CREATE INDEX empresa_suspensa_em_index ON empresa (suspensa_em)')
      }

      if (!(await temColuna(db, 'empresa', 'suspensa_motivo'))) {
        await db.rawQuery('ALTER TABLE empresa ADD COLUMN suspensa_motivo VARCHAR(255) NULL')
      }

      // Quem carregou no botão. `SET NULL` e não `CASCADE`: apagar o administrador
      // que suspendeu não pode reactivar a empresa que ele suspendeu.
      if (!(await temColuna(db, 'empresa', 'suspensa_por'))) {
        await db.rawQuery('ALTER TABLE empresa ADD COLUMN suspensa_por CHAR(36) NULL')
      }

      if (!(await temRestricao(db, 'empresa', 'empresa_suspensa_por_foreign'))) {
        await db.rawQuery(
          `ALTER TABLE empresa
             ADD CONSTRAINT empresa_suspensa_por_foreign
             FOREIGN KEY (suspensa_por) REFERENCES user (id) ON DELETE SET NULL`
        )
      }

      if (!(await temRestricao(db, 'empresa', 'empresa_suspensao_chk'))) {
        await db.rawQuery(
          `ALTER TABLE empresa
             ADD CONSTRAINT empresa_suspensao_chk
             CHECK (
               (suspensa_em IS NULL AND suspensa_motivo IS NULL)
               OR (suspensa_em IS NOT NULL AND suspensa_motivo IS NOT NULL)
             )`
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temRestricao(db, 'empresa', 'empresa_suspensao_chk')) {
        await db.rawQuery('ALTER TABLE empresa DROP CONSTRAINT empresa_suspensao_chk')
      }

      if (await temRestricao(db, 'empresa', 'empresa_suspensa_por_foreign')) {
        await db.rawQuery('ALTER TABLE empresa DROP FOREIGN KEY empresa_suspensa_por_foreign')
      }

      for (const coluna of ['suspensa_por', 'suspensa_motivo', 'suspensa_em']) {
        if (await temColuna(db, 'empresa', coluna)) {
          await db.rawQuery(`ALTER TABLE empresa DROP COLUMN ${coluna}`)
        }
      }
    })
  }
}
