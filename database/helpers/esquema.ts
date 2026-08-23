import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/**
 * Perguntas ao `information_schema`, para migrações que se possam repetir.
 *
 * ── Porque é que isto existe ───────────────────────────────────────────────────
 *
 * **O MySQL não faz DDL transaccional.** Um `ALTER TABLE` que corra fica feito,
 * mesmo que a migração rebente na instrução seguinte — e o Adonis só escreve em
 * `adonis_schema` no fim. Uma migração que falhe a meio deixa portanto o pior dos
 * dois mundos: metade do esquema alterado, e o registo a dizer que ela nunca
 * correu.
 *
 * A tentativa seguinte volta ao princípio e bate em `Duplicate column name`. A
 * partir daí o `migration:run` não avança mais — nem essa migração, nem nenhuma
 * das que vêm a seguir. Foi exactamente isto que parou o deploy de `api-qua`:
 * `alter_papel_por_empresa` meia aplicada, o backfill que vinha logo a seguir
 * nunca correu, e todos os papéis ficaram com `escopo = 'modelo'` (o valor por
 * omissão) — que não é atribuível a ninguém. Sistema de pé, ninguém com acesso.
 *
 * ── A regra que estas funções permitem cumprir ─────────────────────────────────
 *
 * **Uma migração que altere esquema tem de poder correr duas vezes.** Cada passo
 * pergunta primeiro se já está feito. Assim, uma migração meia aplicada é
 * recuperada pela própria reexecução: salta o que já lá está, faz o que falta, e
 * regista-se. Sem isto, a recuperação é sempre SQL à mão num servidor de
 * produção, com alguém a adivinhar até onde a migração chegou.
 *
 * ── Notas de uso ───────────────────────────────────────────────────────────────
 *
 * - Usar dentro de `this.defer(async (db) => ...)`: o `this.schema.alterTable()`
 *   do knex constrói a instrução ANTES de qualquer pergunta poder ser feita, e um
 *   `defer` corre na ordem em que foi declarado, entre os outros passos.
 * - `DATABASE()` limita tudo ao esquema em uso. Sem isso, um servidor com várias
 *   bases (dev, teste e qa lado a lado) dava respostas de outra base.
 * - São específicas do MySQL, tal como as migrações que as usam. Este projecto é
 *   MySQL e não tem intenção de deixar de ser.
 */

async function existe(db: QueryClientContract, sql: string, valores: string[]) {
  const [linhas] = await db.rawQuery(sql, valores)
  return (linhas as unknown[]).length > 0
}

/** A coluna existe nesta tabela? */
export function temColuna(db: QueryClientContract, tabela: string, coluna: string) {
  return existe(
    db,
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [tabela, coluna]
  )
}

/**
 * O índice existe, com este nome?
 *
 * Pelo NOME e não pelas colunas: é pelo nome que se larga um índice, e é o nome
 * que o knex gera por convenção (`<tabela>_<colunas>_unique`, `..._index`).
 */
export function temIndice(db: QueryClientContract, tabela: string, indice: string) {
  return existe(
    db,
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1`,
    [tabela, indice]
  )
}

/**
 * A restrição existe, com este nome?
 *
 * Cobre CHECK, FOREIGN KEY, UNIQUE e PRIMARY KEY — o `TABLE_CONSTRAINTS` do MySQL 8
 * lista-as todas. Chega para o que estas migrações precisam de perguntar, e evita
 * três funções quase iguais.
 *
 * Atenção a uma coisa que isto NÃO apanha: uma chave estrangeira criada com outro
 * nome. O MySQL aceita duas chaves iguais com nomes diferentes, portanto a
 * pergunta só é fiável enquanto os nomes forem os que o knex gera
 * (`<tabela>_<coluna>_foreign`) ou os que a migração escreve à mão.
 */
export function temRestricao(db: QueryClientContract, tabela: string, restricao: string) {
  return existe(
    db,
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
      LIMIT 1`,
    [tabela, restricao]
  )
}
