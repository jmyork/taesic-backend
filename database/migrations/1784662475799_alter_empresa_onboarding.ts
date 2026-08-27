import { BaseSchema } from '@adonisjs/lucid/schema'

import { temColuna } from '../helpers/esquema.js'

/**
 * O onboarding passa a ter estado guardado — até aqui não tinha nenhum.
 *
 * O ecrã existia (`/[companyAlias]/onboarding`, sete passos) e nunca corria: o
 * `ProtectedRoute` do frontend decide por `user.onboarded === false`, esse valor vinha
 * de sinalizadores (`first_time`, `is_new_user`, `onboarding_completed`) que **nenhuma
 * rota deste backend alguma vez devolveu**, e um `undefined` não é `false`. Toda a gente
 * caía directamente no dashboard, com o catálogo vazio e sem nunca ver o passo do ramo.
 *
 * ── As duas colunas ────────────────────────────────────────────────────────────
 *
 * `ramo_actuacao` — a escolha do primeiro passo (`farmacia`, `restaurante`, ...). Guardada
 * como texto e não como enum de propósito: o catálogo de ramos vive em
 * `app/helpers/ramos_de_actuacao.ts`, e acrescentar um ramo novo não deve exigir uma
 * migração. Um valor que deixe de existir no catálogo continua legível — é história do
 * que a empresa escolheu, não uma chave estrangeira.
 *
 * `onboarding_concluido_em` — quando é que o dono chegou ao fim. NULL = por concluir, e é
 * essa a pergunta que o login e o `auth/me` passam a responder.
 *
 * Ambas anuláveis, sem valor por omissão, conforme a secção 7.20: a obrigatoriedade do
 * ramo impõe-se no validator do passo do onboarding, não aqui.
 *
 * ── O backfill, e porque é que a condição é "tem produtos" ─────────────────────
 *
 * Sem backfill, todas as empresas que já existem passariam a ter `onboarding_concluido_em
 * IS NULL` e seriam atiradas para o onboarding no login seguinte — pessoas a trabalhar há
 * meses, mandadas escolher um ramo.
 *
 * A condição óbvia (`WHERE onboarding_concluido_em IS NULL`, sem mais) não serve, porque
 * esta migração tem de poder correr **duas vezes** (secção 7.19): à segunda passagem
 * varreria também as empresas registadas entretanto, e marcá-las-ia como concluídas sem
 * nunca terem visto o ecrã.
 *
 * "Já tem produtos" distingue as duas populações e não deixa de o fazer numa reexecução:
 * uma empresa acabada de registar tem catálogo vazio (o registo semeia posto, papéis e
 * métodos de pagamento — nunca produtos), e uma empresa com produtos ou já semeou o ramo
 * no onboarding, ou o dono criou-os à mão. Nos dois casos dar-lhe o onboarding por
 * concluído é a resposta certa.
 *
 * O caso que fica de fora — empresa antiga, ainda sem um único produto — vê o onboarding
 * uma vez. Para essa, é o que ela devia ter tido no início.
 *
 * `created_at` e não `NOW()`: a data que interessa é a de quando a empresa começou a
 * trabalhar, não a do dia em que esta migração correu no servidor.
 */
export default class extends BaseSchema {
  protected tableName = 'empresa'

  /** Re-executável: cada passo pergunta antes de fazer. Ver
   *  `database/helpers/esquema.ts` para o porquê de isto não ser opcional. */
  async up() {
    this.defer(async (db) => {
      if (!(await temColuna(db, 'empresa', 'ramo_actuacao'))) {
        await db.rawQuery('ALTER TABLE empresa ADD COLUMN ramo_actuacao VARCHAR(64) NULL')
      }

      if (!(await temColuna(db, 'empresa', 'onboarding_concluido_em'))) {
        await db.rawQuery(
          'ALTER TABLE empresa ADD COLUMN onboarding_concluido_em TIMESTAMP NULL'
        )
      }

      // Depois das colunas, nunca antes: o que pode falhar vem a seguir ao que
      // desbloqueia a escrita (secção 7.20).
      await db.rawQuery(
        `UPDATE empresa
            SET onboarding_concluido_em = created_at
          WHERE onboarding_concluido_em IS NULL
            AND EXISTS (SELECT 1 FROM produtos WHERE produtos.empresa_id = empresa.id)`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      for (const coluna of ['onboarding_concluido_em', 'ramo_actuacao']) {
        if (await temColuna(db, 'empresa', coluna)) {
          await db.rawQuery(`ALTER TABLE empresa DROP COLUMN ${coluna}`)
        }
      }
    })
  }
}
