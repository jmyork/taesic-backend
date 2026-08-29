import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, computed } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

/**
 * O que se ESCREVE ao lado de um valor, a partir do código ISO guardado.
 *
 * `plano.moeda` guarda `AOA`, que é o código correcto para uma coluna. Mas o produto
 * inteiro escreve "Kz" — é o que o frontend faz (`formatarKz`), é o que está nos
 * cartões e nas facturas, e é como as pessoas em Angola escrevem a moeda. Sem esta
 * tradução, a linha derivada dizia "Facturação até 500.000 AOA por mês" ao lado de um
 * preço formatado como "7.500 Kz", no mesmo cartão.
 *
 * Um código desconhecido sai tal e qual: mais vale mostrar "USD" do que inventar.
 */
const SIMBOLO_DA_MOEDA: Record<string, string> = { AOA: 'Kz' }
const simboloDaMoeda = (codigo: string | null | undefined) =>
  SIMBOLO_DA_MOEDA[String(codigo ?? '').toUpperCase()] ?? codigo ?? ''

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

  /**
   * As linhas do cartão que descrevem os LIMITES, derivadas dos próprios limites.
   *
   * ── Porque é que isto não é texto escrito à mão ────────────────────────────
   *
   * Era. As quatro primeiras entradas de `funcionalidades` diziam exactamente o mesmo
   * que os quatro `limite_*`, noutro sítio e por outras palavras: "Até 2 utilizadores"
   * ao lado de `limite_utilizadores: 2`. Enquanto ninguém mexia nos planos, ninguém
   * dava por isso.
   *
   * O problema aparece no dia em que alguém mexe — que é agora, porque `plano` tem CRUD
   * no backoffice. Mudar `limite_utilizadores` de 2 para 5 fazia o backend passar a
   * aceitar 5 e o cartão continuar a prometer 2. O ecrã que vende o plano passava a
   * mentir sobre o plano, e o único aviso era alguém reparar.
   *
   * Derivar tira a escolha de quem edita: o número é a única fonte, e a frase segue-o.
   *
   * `funcionalidades` continua a existir e continua editável — é onde vivem as linhas
   * que NÃO são limites ("Ponto de venda e controlo de stock", "Gestão de promotores e
   * cupões"). O cartão mostra estas primeiro e essas a seguir.
   *
   * `@computed` para sair no JSON sem nenhum endpoint ter de se lembrar: os planos são
   * servidos ao onboarding, ao ecrã de Subscrição e ao backoffice, e uma lista montada
   * em cada um deles voltaria a poder divergir.
   */
  @computed()
  get limites_descritos(): string[] {
    // `0` é tratado como ilimitado em todo o lado (ver `limites_do_plano.ts`): um plano
    // mal preenchido não pode trancar a empresa de um cliente, e a frase tem de dizer o
    // mesmo que o backend faz.
    const semLimite = (v: number | null) => v === null || v === undefined || Number(v) <= 0

    // "2.000", "500.000" — como o resto do produto escreve valores.
    //
    // À mão e não com `toLocaleString('pt-PT')`: essa não agrupa números de 4 dígitos
    // (dava "2000" ao lado de "500.000") e depende do ICU com que o Node foi compilado,
    // o que faria a mesma frase sair diferente conforme o servidor.
    const numero = (v: number) => String(Math.trunc(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

    const contagem = (v: number | null, singular: string, plural: string, semLimiteTexto: string) =>
      semLimite(v) ? semLimiteTexto : Number(v) === 1 ? `1 ${singular}` : `Até ${numero(Number(v))} ${plural}`

    return [
      contagem(this.limite_utilizadores, 'utilizador', 'utilizadores', 'Utilizadores sem limite'),
      contagem(
        this.limite_postos,
        'posto de atendimento',
        'postos de atendimento',
        'Postos de atendimento sem limite'
      ),
      contagem(this.limite_produtos, 'produto', 'produtos', 'Produtos sem limite'),
      semLimite(this.limite_faturacao_mensal)
        ? 'Facturação sem tecto'
        : `Facturação até ${numero(Number(this.limite_faturacao_mensal))} ${simboloDaMoeda(this.moeda)} por mês`,
    ]
  }
}
