import { BaseSchema } from '@adonisjs/lucid/schema'

import { temIndice } from '../helpers/esquema.js'

/**
 * `empresa.nif` passa a ter unicidade a sério — na base de dados.
 *
 * Até aqui a unicidade do NIF era só uma regra do validador de registo
 * (`.unique()` a consultar a tabela). `nome` e `company_alias` têm índice único;
 * `nif` não tinha nenhum. Duas consequências, ambas reais:
 *
 *  1. **Corrida.** Dois registos simultâneos com o mesmo NIF consultam a tabela
 *     antes de qualquer um dos dois gravar, ambos vêem que está livre, e ambos
 *     entram. A janela é pequena e é exactamente a que um script explora.
 *  2. **Qualquer caminho que não passe pelo validador** (um comando ace, uma
 *     correcção à mão, um seeder) duplica sem nada a assinalar.
 *
 * E a regra do validador contornava-se com um espaço: sem `.trim()`, `' 5000000000'`
 * é uma string diferente de `'5000000000'` para o MySQL (verificado contra a coluna
 * real: a primeira devolve 0 linhas, a segunda devolve 1), portanto passava o
 * `.unique()` e ficava gravada como um NIF distinto. O `.trim()` foi acrescentado ao
 * validador na mesma sessão; esta migração fecha o buraco também para os dados que já
 * lá estão.
 *
 * A comparação de MAIÚSCULAS não é problema: a coluna é `utf8mb4_0900_ai_ci`, portanto
 * `'5417abc' = '5417ABC'` é verdadeiro tanto no `.unique()` do validador como neste
 * índice. Os dois concordam, que é o que interessa.
 *
 * **Aborta em vez de falhar em silêncio.** Se houver NIFs repetidos depois da
 * normalização, a migração pára e diz quais. Criar o índice à força não é opção
 * (o MySQL recusaria de qualquer forma), e escolher qual das empresas duplicadas
 * sobrevive é uma decisão de negócio, não de migração.
 */
export default class extends BaseSchema {
  protected tableName = 'empresa'

  /** Re-executavel: ver `database/helpers/esquema.ts`. */
  async up() {
    // 1. Normalizar o que já existe. `TRIM()` do MySQL tira espaços dos dois lados.
    this.defer(async (db) => {
      await db.rawQuery('UPDATE empresa SET nif = TRIM(nif) WHERE nif IS NOT NULL AND nif <> TRIM(nif)')

      // 2. Só depois procurar repetidos — normalizar primeiro pode revelar duplicados
      //    que antes estavam escondidos por um espaço, e é bom que revele.
      const [repetidos] = await db.rawQuery(
        `SELECT nif, COUNT(*) AS total
           FROM empresa
          WHERE nif IS NOT NULL
          GROUP BY nif
         HAVING COUNT(*) > 1`
      )

      if ((repetidos as any[]).length > 0) {
        const lista = (repetidos as any[]).map((l) => `${l.nif} (${l.total}x)`).join(', ')
        throw new Error(
          `Não é possível impor unicidade a empresa.nif: existem NIFs repetidos — ${lista}. ` +
            `Resolva os duplicados (decidir qual empresa fica com o NIF) antes de correr esta migração.`
        )
      }

      // 3. O índice. `nif` continua nullable e o MySQL permite vários NULL num índice
      //    único — o que é o comportamento certo aqui: uma empresa sem NIF gravado é um
      //    problema de dados, não algo que este índice deva resolver.
      //
      //    Guardado, como todo o DDL deste projecto: sem a pergunta, uma segunda
      //    passagem morre com `Duplicate key name`. Ver `database/helpers/esquema.ts`.
      if (!(await temIndice(db, 'empresa', 'empresa_nif_unique'))) {
        await db.rawQuery('CREATE UNIQUE INDEX empresa_nif_unique ON empresa (nif)')
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temIndice(db, 'empresa', 'empresa_nif_unique')) {
        await db.rawQuery('DROP INDEX empresa_nif_unique ON empresa')
      }
    })
  }
}
