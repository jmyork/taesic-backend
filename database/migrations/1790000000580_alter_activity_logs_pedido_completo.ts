import { BaseSchema } from '@adonisjs/lucid/schema'

import { temColuna, temTabela } from '../helpers/esquema.js'

/**
 * O pedido e a resposta inteiros no registo de actividade.
 *
 * A primeira versão guardava quem/o quê/quando/resultado e **não** o corpo, por duas
 * razões escritas no middleware: o corpo traz segredos, e é o que foi PEDIDO e não o
 * que ficou gravado. O dono do produto quer o rasto completo — cabeçalhos, parâmetros,
 * entrada e saída — e essa é a decisão dele. O que muda é COMO se guarda, não SE.
 *
 * ── Nada entra em bruto ──────────────────────────────────────────────────────
 *
 * Tudo passa por `redigir()` (ver `app/helpers/activity_logger.ts`): campos com nome
 * de segredo — password, token, hash, cookie, authorization, cvv, iban — saem
 * substituídos por `[redigido]`, a qualquer profundidade. Sem isso, esta tabela
 * passaria a ser o sítio mais perigoso da base de dados: é consultável, sobrevive ao
 * apagar dos dados que descreve, e teria as palavras-passe de toda a gente.
 *
 * ── Porquê `longtext` e não `json` ────────────────────────────────────────────
 *
 * A mesma escolha de `security_logs.details` e de `activity_logs.changes`: mais
 * portátil e sem depender do auto-parse do driver, que já mordeu este projecto. O
 * model faz a serialização, uma vez, para nenhum chamador saber que é texto.
 *
 * ── O tamanho ────────────────────────────────────────────────────────────────
 *
 * Cada coluna é cortada pelo serviço a alguns milhares de caracteres. Um catálogo de
 * produtos ou um upload não cabem aqui nem devem caber — o que se quer é reconstruir
 * o que aconteceu, não guardar uma segunda cópia da base de dados. O corte é marcado
 * no próprio valor, para quem lê saber que está a ver uma parte.
 */
export default class extends BaseSchema {
  protected tableName = 'activity_logs'

  /** Re-executável, como todas as outras — ver database/helpers/esquema.ts. */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) return

      const colunas: [string, string][] = [
        ['request_headers', 'LONGTEXT NULL'],
        ['request_query', 'LONGTEXT NULL'],
        ['request_body', 'LONGTEXT NULL'],
        ['response_body', 'LONGTEXT NULL'],
        // Quanto tempo o pedido demorou. É a coluna que transforma o registo num
        // sítio onde se responde a "o que estava lento ontem às 15h?".
        ['duration_ms', 'INT NULL'],
        // O nome de quem fez a acção, copiado no momento.
        //
        // Já havia `user_id` e `user_email`. O nome é o que se lê num ecrã de
        // auditoria sem ter de ir procurar quem é `8f3a…` — e, como o email, é
        // copiado em vez de resolvido por FK: o registo tem de continuar legível
        // depois de o funcionário ser apagado.
        ['user_nome', 'VARCHAR(255) NULL'],
      ]

      for (const [nome, tipo] of colunas) {
        if (!(await temColuna(db, this.tableName, nome))) {
          await db.rawQuery(`ALTER TABLE activity_logs ADD COLUMN ${nome} ${tipo}`)
        }
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) return

      for (const nome of [
        'request_headers',
        'request_query',
        'request_body',
        'response_body',
        'duration_ms',
        'user_nome',
      ]) {
        if (await temColuna(db, this.tableName, nome)) {
          await db.rawQuery(`ALTER TABLE activity_logs DROP COLUMN ${nome}`)
        }
      }
    })
  }
}
