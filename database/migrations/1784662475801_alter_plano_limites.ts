import { BaseSchema } from '@adonisjs/lucid/schema'

import { temColuna, temIndice } from '../helpers/esquema.js'

/**
 * Os planos passam a ter diferenças que o sistema conhece.
 *
 * `plano` tinha `nome`, `descricao`, `preco`, `moeda`, `periodo`, `ativo` e um
 * `limite_uso` sem unidade — limite de quê? A tabela estava vazia, e os planos que o
 * ecrã de onboarding mostrava estavam escritos à mão no frontend, em EUROS, com
 * funcionalidades inventadas ("Gestão de múltiplas farmácias") que nada impunha. Escolher
 * um plano não mudava absolutamente nada no comportamento do produto.
 *
 * ── As colunas novas ───────────────────────────────────────────────────────────
 *
 * `slug` — identificador estável (`gratuito`, `basico`, `pro`). O `nome` é texto de
 * montra e há-de mudar; o código precisa de uma chave que não mude, e `id` é um UUID
 * diferente em cada base de dados (dev, qa, produção), portanto não serve para semear
 * nem para comparar.
 *
 * `limite_utilizadores`, `limite_postos`, `limite_produtos` — quantos de cada. **NULL
 * significa ilimitado**, e não "zero": é o valor certo para o plano de topo, e evita ter
 * de escrever um número grande à esperança de que ninguém lá chegue.
 *
 * `limite_faturacao_mensal` — o tecto de facturação do plano gratuito, em Kwanza. É o
 * modelo de negócio pedido: usar de graça enquanto o negócio é pequeno, pagar quando
 * cresce. NULL = sem tecto.
 *
 * `dias_gratuitos` — período livre no arranque, para os planos pagos. Zero = sem período.
 *
 * `funcionalidades` — a lista que o cartão do plano mostra, em JSON dentro de um `TEXT`.
 * Coluna de texto e não `JSON` nativa, pelo mesmo motivo já registado para
 * `security_logs.details`: mais portátil, sem depender do auto-parse do driver.
 *
 * `ordem` — por onde os planos aparecem no ecrã. Sem isto a ordem era a da inserção, que
 * muda quando alguém edita um plano no backoffice.
 *
 * ── Todas anuláveis ou com valor por omissão (secção 7.20) ────────────────────
 *
 * Sem excepção. Um `NOT NULL` sem default numa destas recusaria qualquer escrita em
 * `plano` feita por um caminho que ainda não as conheça — incluindo o CRUD do
 * `taesic-backoffice-api`, que é outro projecto e não é actualizado ao mesmo tempo.
 */
export default class extends BaseSchema {
  protected tableName = 'plano'

  /** Re-executável: cada passo pergunta antes de fazer (secção 7.19). */
  async up() {
    this.defer(async (db) => {
      const colunas: [nome: string, definicao: string][] = [
        ['slug', 'VARCHAR(32) NULL'],
        ['limite_utilizadores', 'INT UNSIGNED NULL'],
        ['limite_postos', 'INT UNSIGNED NULL'],
        ['limite_produtos', 'INT UNSIGNED NULL'],
        ['limite_faturacao_mensal', 'DECIMAL(22,2) NULL'],
        ['dias_gratuitos', 'INT UNSIGNED NOT NULL DEFAULT 0'],
        ['funcionalidades', 'TEXT NULL'],
        ['ordem', 'INT NOT NULL DEFAULT 0'],
      ]

      for (const [nome, definicao] of colunas) {
        if (!(await temColuna(db, 'plano', nome))) {
          await db.rawQuery(`ALTER TABLE plano ADD COLUMN ${nome} ${definicao}`)
        }
      }

      // Único, mas anulável: os planos que já existirem sem slug não impedem a criação do
      // índice (no MySQL os NULL não colidem entre si num índice único), e a partir daqui
      // dois planos não podem partilhar o mesmo identificador estável.
      if (!(await temIndice(db, 'plano', 'plano_slug_unique'))) {
        await db.rawQuery('CREATE UNIQUE INDEX plano_slug_unique ON plano (slug)')
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temIndice(db, 'plano', 'plano_slug_unique')) {
        await db.rawQuery('DROP INDEX plano_slug_unique ON plano')
      }

      for (const coluna of [
        'ordem',
        'funcionalidades',
        'dias_gratuitos',
        'limite_faturacao_mensal',
        'limite_produtos',
        'limite_postos',
        'limite_utilizadores',
        'slug',
      ]) {
        if (await temColuna(db, 'plano', coluna)) {
          await db.rawQuery(`ALTER TABLE plano DROP COLUMN ${coluna}`)
        }
      }
    })
  }
}
