import type { FacturaTipo } from '../helpers/tipos_de_documento.js'
import type { MotivoAnulacao } from '#models/faturacao/factura'

export interface EmitirFacturaDTO {
  company_alias: string
  tipo: FacturaTipo

  /**
   * Quem está a emitir.
   *
   * Não vem do corpo do pedido — vem da sessão, posto pelo controlador. Deixá-lo
   * ser enviado permitiria emitir um documento em nome de outra pessoa, que é
   * precisamente o que a identificação do emissor existe para impedir.
   *
   * Opcional porque há um emissor legítimo que não é uma pessoa: a varredura
   * diária de avisos de cobrança (`aviso-cobranca:emitir`) corre sem sessão.
   */
  emitido_por_user_id?: string | null

  /** Obrigatório só nos tipos com `exigeVenda` — ver `tipos_de_documento.ts`. */
  venda_id?: string

  /** Obrigatório nos tipos com `exigeOrigem` (nota de crédito, recibo, aviso). */
  documento_origem_id?: string

  /** As vendas cobertas — obrigatório só na factura global. */
  vendas_ids?: string[]

  /** Obrigatórios só na factura global. */
  periodo_inicio?: Date
  periodo_fim?: Date

  /**
   * A data em que o documento tem de estar pago — o que o torna uma conta a
   * receber. Obrigatória nos tipos com `vencimento: 'exige'` (a `Factura`),
   * recusada nos que a proíbem. Ver `tipos_de_documento.ts`.
   */
  data_vencimento?: Date

  /** Sem isto, a série por omissão do tipo e do ano (`FT2026`). */
  serie?: string

  data_operacao?: Date
  local_operacao?: string

  /**
   * A CONTRAPARTE do documento, quando ela não se deriva de nada.
   *
   * Nos documentos que nascem de uma venda ou de outro documento, estes campos são
   * IGNORADOS: o adquirente é o da venda ou o da origem, e aceitar aqui um nome
   * diferente permitiria emitir um recibo em nome de outra pessoa que não a que
   * consta da factura que ele liquida.
   *
   * Existem para os que nascem sozinhos — e sobretudo para a **autofacturação**,
   * onde a contraparte é o FORNECEDOR e não um cliente. Sem eles, uma
   * autofacturação saía sem dizer em nome de quem foi emitida, que é a única coisa
   * que a define.
   */
  cliente_nome?: string
  cliente_nif?: string
  cliente_morada?: string

  /** Exigido nos tipos que não nascem de uma venda; ignorado nos outros. */
  total?: number

  observacoes?: string
}

export interface FacturaQueryDTO {
  company_alias: string
  page?: number
  limit?: number
  venda_id?: string
  tipo?: FacturaTipo
  serie?: string
  ano?: number
  status?: 'emitida' | 'anulada'
  vendedor?: string
  vendedor_id?: string
  data_inicio?: Date
  data_fim?: Date

  /** Só o que está por receber — facturas com vencimento e sem recibo por cima. */
  em_divida?: boolean

  /** Só o que já passou do prazo. Implica `em_divida`. */
  vencidas?: boolean

  q?: string
  deleted?: 'deleted' | 'all' | null
}

/**
 * Até onde vai a anulação.
 *
 *  · `dependentes` (omissão) — o documento e tudo o que DEPENDE dele. Anular a
 *    factura arrasta o recibo, as notas e os avisos; anular o recibo desfaz só o
 *    recibo, e a factura volta a estar por receber.
 *
 *  · `operacao` — o documento e TODOS os da mesma operação, incluindo a origem e
 *    os irmãos pela venda. Anular o recibo desfaz também a factura.
 *
 * São duas acções diferentes e não um parâmetro de afinação. A primeira é o que
 * se faz quando um documento saiu errado; a segunda é o que se faz quando a
 * operação inteira não devia ter acontecido — e desfaz uma venda, portanto tem de
 * ser pedida por quem a quer, nunca ser o efeito de omissão de um clique.
 */
export type AlcanceDaAnulacao = 'dependentes' | 'operacao'

export interface AnularFacturaDTO {
  id: string
  company_alias: string
  /** `I` ou `N` — obrigatório, imposto no validator. */
  motivo_anulacao: MotivoAnulacao

  /** Ver `AlcanceDaAnulacao`. Omitido vale `'dependentes'`. */
  alcance?: AlcanceDaAnulacao
}

export interface ShowFacturaDTO {
  id: string
  company_alias: string
}

/**
 * Confirmar que o dinheiro de uma factura a crédito entrou.
 *
 * Emite o recibo que a liquida — é o único caminho pelo qual uma conta a receber
 * sai do mapa de cobranças, e é deliberado que emita um documento em vez de
 * marcar um campo: quem paga tem direito ao recibo, e um estado gravado sem
 * documento seria a empresa a saber que recebeu e o cliente a não ter prova.
 */
export interface ConfirmarRecebimentoDTO {
  id: string
  company_alias: string

  /** Quem confirmou — assina o recibo. Posto pelo controlador, nunca pelo pedido. */
  emitido_por_user_id?: string | null

  /** Quando o dinheiro entrou, se não foi hoje. */
  data_recebimento?: Date

  observacoes?: string
}
