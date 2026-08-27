import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class plano extends BaseModel {
  static table = 'plano'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: plano) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string
  @column()
  declare descricao: string
  @column()
  declare preco: number
  @column()
  declare moeda: string
  @column()
  declare periodo: string
  @column()
  declare ativo: boolean
  /** Sem unidade definida em lado nenhum, e sempre NULL na prática. Mantida por a coluna
   *  existir; os limites que o produto impõe são os que se seguem. */
  @column()
  declare limite_uso: number

  /**
   * Identificador estável do plano (`gratuito`, `basico`, `pro`).
   *
   * O `nome` é texto de montra e há-de mudar; `id` é um UUID diferente em cada base de
   * dados. É por `slug` que o código semeia, compara e escolhe o plano de arranque.
   */
  @column()
  declare slug: string | null

  /** **NULL = ilimitado**, nunca zero. Ver a migração `alter_plano_limites`. */
  @column()
  declare limite_utilizadores: number | null

  /** **NULL = ilimitado.** */
  @column()
  declare limite_postos: number | null

  /** **NULL = ilimitado.** */
  @column()
  declare limite_produtos: number | null

  /**
   * Tecto de facturação por mês civil, em Kwanza. **NULL = sem tecto.**
   *
   * É o modelo de negócio do plano gratuito: usar de graça enquanto o negócio é pequeno,
   * pagar quando cresce. Imposto no fecho da venda — ver `limites_do_plano.ts`.
   */
  @column()
  declare limite_faturacao_mensal: number | null

  /** Dias de período livre no arranque de uma subscrição paga. 0 = sem período. */
  @column()
  declare dias_gratuitos: number

  /**
   * A lista que o cartão do plano mostra, guardada como JSON num `TEXT`.
   *
   * Os getters/setters fazem a serialização aqui, uma vez, para nenhum chamador ter de
   * saber que a coluna é texto — e para um valor mal formado (escrito à mão na base de
   * dados) dar uma lista vazia em vez de rebentar o ecrã de planos.
   */
  @column({
    prepare: (valor: string[] | null) => (valor ? JSON.stringify(valor) : null),
    consume: (valor: string | null) => {
      if (!valor) return []
      try {
        const lido = JSON.parse(valor)
        return Array.isArray(lido) ? lido.map(String) : []
      } catch {
        return []
      }
    },
  })
  declare funcionalidades: string[]

  /** Por onde os planos aparecem no ecrã. */
  @column()
  declare ordem: number

  /** Um plano sem preço é o plano gratuito. `preco` vem do MySQL como string (DECIMAL). */
  get eGratuito(): boolean {
    return Number(this.preco) === 0
  }
}
