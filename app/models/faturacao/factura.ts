import { DateTime } from 'luxon'
import { BaseModel, column, computed, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from '#models/empresa'
import {
  type CategoriaDocumento,
  type FacturaTipo,
  TIPOS_DE_DOCUMENTO,
  referenciaDe,
} from '../../helpers/tipos_de_documento.js'
import vendas from './vendas.js'

export type { FacturaTipo }
export type FacturaStatus = 'emitida' | 'anulada'

/** `I` — incorrecta identificação do adquirente; `N` — não enviado ao adquirente. */
export type MotivoAnulacao = 'I' | 'N'

export default class factura extends BaseModel {
  static table = 'factura'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: factura) {
    model.id ??= randomUUID()
  }

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  /**
   * Anulável: recibos, avisos de cobrança, notas de crédito autónomas e facturas
   * de adiantamento nascem sem venda, e a factura global tem várias (nenhuma delas
   * «a» venda).
   */
  @column()
  declare venda_id: string | null

  @belongsTo(() => vendas, { foreignKey: 'venda_id' })
  declare venda: BelongsTo<typeof vendas>

  /**
   * Sequencial DENTRO da série — não por empresa.
   *
   * Sozinho não identifica nada: pode haver uma `NC` n.º 14 e uma `FT` n.º 14 na
   * mesma empresa, no mesmo ano, e ambas correctas. Quem precisa de identificar um
   * documento usa `referencia`.
   */
  @column()
  declare numero: number

  @column()
  declare serie: string | null

  @column()
  declare ano: number | null

  @column()
  declare tipo: FacturaTipo

  @column()
  declare status: FacturaStatus

  /**
   * Porque é que foi anulado. `I` — incorrecta identificação do adquirente;
   * `N` — documento não enviado ao adquirente. Os dois únicos motivos que os
   * n.ºs 8 e 9 do art.º 8.º admitem, e os mesmos que a AGT aceita.
   */
  @column()
  declare motivo_anulacao: MotivoAnulacao | null

  /**
   * O documento que este rectifica ou liquida — obrigatório nas notas de crédito
   * (E13 da AGT), nos recibos e nos avisos de cobrança. Ver `exigeOrigem` em
   * `app/helpers/tipos_de_documento.ts`.
   */
  @column()
  declare documento_origem_id: string | null

  @belongsTo(() => factura, { foreignKey: 'documento_origem_id' })
  declare documento_origem: BelongsTo<typeof factura>

  @column()
  declare cliente_nome: string | null

  @column()
  declare cliente_nif: string | null

  /** Sede ou domicílio do adquirente (art.º 10.º), copiado no momento da emissão. */
  @column()
  declare cliente_morada: string | null

  @column()
  declare total: number

  @column.dateTime()
  declare data_emissao: DateTime

  /**
   * Data, hora e local da OPERAÇÃO (art.º 10.º) — distintos da emissão, que o
   * art.º 8.º permite até ao quinto dia útil seguinte.
   */
  @column.dateTime()
  declare data_operacao: DateTime | null

  @column()
  declare local_operacao: string | null

  /** Período coberto — só na factura global (art.º 8.º, periodicidade máxima mensal). */
  @column.date()
  declare periodo_inicio: DateTime | null

  @column.date()
  declare periodo_fim: DateTime | null

  /**
   * Código hash e identificação do software validado (art.º 10.º). Nulos enquanto a
   * comunicação à AGT não estiver ligada — um documento sem hash é um documento por
   * comunicar, e é assim que se lê a coluna vazia.
   */
  @column()
  declare hash: string | null

  @column()
  declare software_id: string | null

  @column()
  declare observacoes: string | null

  /* ── O tipo, explícito ────────────────────────────────────────────────────────
   *
   * Os três campos abaixo são derivados e vão em TODAS as respostas da API. Existem
   * para que nenhum consumidor — ecrã, PDF, talão térmico — tenha de saber traduzir
   * `factura.tipo` para o que se imprime. Quem constrói um documento a partir desta
   * resposta não precisa de nenhuma tabela do seu lado, e por isso não pode ter uma
   * desactualizada.
   */

  /** O `documentType` da AGT: `FT`, `FR`, `NC`, ... */
  @computed()
  get codigo_documento(): string {
    return TIPOS_DE_DOCUMENTO[this.tipo]?.codigo ?? ''
  }

  /**
   * A designação a imprimir no topo do documento, por extenso e em português.
   *
   * É o que o art.º 10.º manda constar e é a única coisa nesta resposta que um
   * cliente vai ler. Nunca a chave interna: `'Outros Recibos'` imprime-se «Recibo».
   */
  @computed()
  get designacao(): string {
    return TIPOS_DE_DOCUMENTO[this.tipo]?.designacao ?? this.tipo
  }

  @computed()
  get categoria(): CategoriaDocumento | null {
    return TIPOS_DE_DOCUMENTO[this.tipo]?.categoria ?? null
  }

  /**
   * A referência completa — `FT FT2026/1` —, no formato do SAF-T(AO) que a AGT usa
   * em `documentNo`. É isto, e não `numero`, que identifica o documento.
   *
   * Nulo só se alguma linha tiver sido escrita sem série — ver o comentário de
   * `serie` na migração da tabela.
   */
  @computed()
  get referencia(): string | null {
    if (!this.serie || !TIPOS_DE_DOCUMENTO[this.tipo]) return null
    return referenciaDe(this.tipo, this.serie, this.numero)
  }

  /**
   * factura_repository.baseQuery() junta `empresa` e seleciona campos extra (nome/nif/...) para
   * mostrar quem emitiu a factura sem um pedido adicional — colunas fora de @column() só
   * aparecem em $extras por omissão (nunca no JSON de resposta) a menos que serializeExtras()
   * as devolva explicitamente aqui.
   */
  serializeExtras() {
    return {
      empresa_nome: this.$extras.empresa_nome,
      empresa_nif: this.$extras.empresa_nif,
      empresa_localizacao: this.$extras.empresa_localizacao,
      empresa_contacto: this.$extras.empresa_contacto,
      // Quem vendeu — resolvido por vendas→caixa→user em baseQuery(). Nulo em
      // todos os documentos que não nascem de uma venda.
      vendedor_id: this.$extras.vendedor_id,
      vendedor_nome: this.$extras.vendedor_nome,
    }
  }
}
