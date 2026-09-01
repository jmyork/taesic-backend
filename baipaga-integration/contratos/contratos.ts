/**
 * As formas JSON dos onze endpoints, tal como a especificação as define.
 *
 * Tipos, e só tipos — nada aqui corre. Servem para que um campo trocado seja um
 * erro de compilação e não uma recusa do BAI três dias depois.
 *
 * Fonte: `openapi/swagger.json`, cópia literal do que
 * `https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api/swagger.json` servia.
 * O Swagger UI que nos foi indicado é só o invólucro em JavaScript; a
 * especificação é aquele ficheiro, e está guardada aqui para que estes tipos
 * possam ser conferidos contra ela sem depender de o servidor deles estar de pé.
 *
 * ── Uma convenção que vale para o ficheiro inteiro ────────────────────────────
 *
 * A especificação declara `required` em quatro dos dezassete objectos de entrada
 * e em nenhum dos de saída. Onde ela é omissa, os tipos aqui declaram o campo
 * como opcional — a alternativa é o TypeScript prometer que um campo existe
 * numa resposta que pode chegar sem ele, e essa promessa quebra-se em produção,
 * em silêncio, com um `undefined` a atravessar meia aplicação.
 */

import type { CodigoResposta } from '../dominio/codigos_resposta.js'
import type { EstadoPagamento, Fluxo } from '../dominio/estados.js'

/* ────────────────────────────────────────────────────────────────────────────
 * Envelope comum das respostas
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Os dois campos que todas as respostas partilham.
 *
 * `responseCode` está declarado como `string` mas descrito como número — ver
 * `DIVERGENCIAS.md` #C-01. O tipo aceita as duas formas porque as duas cabem no
 * que a especificação diz sobre si própria.
 */
export interface RespostaComum {
  responseCode?: CodigoResposta | string | number
  message?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * Carrinho de compras
 * ──────────────────────────────────────────────────────────────────────────── */

/** Percentagem de IVA aplicável a uma linha do carrinho. */
export interface PercentagemIva {
  id?: number
  description?: string
  /** `14` = 14%. */
  value?: number
}

/**
 * Uma linha do carrinho, na forma de ENTRADA.
 *
 * A especificação define três objectos com estes mesmos campos —
 * `ShoppingCartItem` (entrada), `ShoppingCartItemDetails` (saída) e as duas
 * variantes de percentagem de IVA. A diferença real entre a entrada e a saída é
 * uma só: a saída acrescenta o `id`. Ver `DIVERGENCIAS.md` #C-02.
 */
export interface LinhaDoCarrinho {
  /** Preço unitário. */
  amountPerItem?: number
  description?: string
  count?: number
  discount?: number
  /** `amountPerItem * count - discount`. */
  totalAmount?: number
  vatAmount?: number
  vatPercentage?: PercentagemIva
  /** Pares chave/valor livres. A especificação não diz o que aceita nem o limite. */
  metadata?: Record<string, unknown>
}

/** Uma linha do carrinho, tal como o BAI a devolve. */
export interface LinhaDoCarrinhoCalculada extends LinhaDoCarrinho {
  id?: number
}

export interface Carrinho {
  items?: LinhaDoCarrinho[]
  totalCartItems?: number
  /** Total antes de IVA. */
  totalCartAmount?: number
  totalCartDiscount?: number
  totalCartAmountWithVat?: number
  /**
   * Totais repartidos por taxa de IVA. A especificação diz "key: VAT
   * percentage, value: total amount" sem dizer se a chave é `"14"` ou `"14.0"`
   * ou o `id` da percentagem. Ver `DIVERGENCIAS.md` #C-03.
   */
  totalCartAmountWithVatGroups?: Record<string, number>
}

export interface CarrinhoCalculado extends Omit<Carrinho, 'items'> {
  items?: LinhaDoCarrinhoCalculada[]
}

/* ── POST /rest/partners/external/calculateCart ────────────────────────────── */

export interface PedidoCalcularCarrinho {
  shoppingCart: Carrinho
}

export interface RespostaCalcularCarrinho {
  shoppingCart?: CarrinhoCalculado
}

/* ── GET /rest/partners/external/cartVatPercentages ────────────────────────── */

export interface RespostaPercentagensIva {
  cartItemVatPercentageViewList?: PercentagemIva[]
}

/* ────────────────────────────────────────────────────────────────────────────
 * POST /rest/partners/external/payment/request — valor fixo
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PedidoPagamento {
  merchantId?: number
  /** Formato internacional sem `+`: `244923456789`. */
  customerMsisdn: string
  totalAmount: number
  /** ISO 4217. */
  currency: string
  shoppingCart?: Carrinho
  /** Referência única nossa. É a chave da idempotência — ver README. */
  externalReference: string
  /** Visível para o cliente na aplicação do banco. */
  description?: string
  /** Não visível para o cliente. */
  merchantNotes?: string
}

export interface RespostaPagamento extends RespostaComum {
  paymentId?: number
  /** ISO 8601. Depois disto o pedido caduca sem o cliente ter respondido. */
  expirationDate?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * POST /rest/partners/external/payment/initiate — confirmação por OTP
 * ──────────────────────────────────────────────────────────────────────────── */

/** Igual ao de valor fixo, sem `merchantId` e sem `merchantNotes`. */
export interface PedidoPagamentoOtp {
  customerMsisdn: string
  totalAmount: number
  currency: string
  shoppingCart?: Carrinho
  externalReference: string
  description?: string
}

export interface RespostaPagamentoOtp extends RespostaComum {
  paymentId?: number
  /** Para onde encaminhar o cliente para ele introduzir o código. */
  confirmationUrl?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * POST /rest/partners/external/payment/captive — pré-autorização
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PedidoCativo {
  customerMsisdn: string
  /** O valor mostrado ao cliente no momento da autorização. */
  estimatedAmount: number
  /** Tecto do que pode vir a ser cobrado. Tem de ser `>= estimatedAmount`. */
  maxAmount: number
  currency: string
  shoppingCart?: Carrinho
  externalReference: string
  description?: string
}

export interface RespostaCativo extends RespostaComum {
  paymentId?: number
}

/**
 * Confirmação de um cativo.
 *
 * `paymentId` e `externalReference` são ambos opcionais na especificação, mas um
 * dos dois tem de vir — sem nenhum não há pagamento identificado. É a regra
 * `identificacaoDoPagamento` em `validacao/regras.ts`.
 */
export interface PedidoConfirmarCativo {
  externalReference?: string
  paymentId?: number
  /** `<= maxAmount` do cativo. */
  finalAmount: number
}

export interface RespostaConfirmarCativo extends RespostaComum {
  paymentId?: number
}

export interface PedidoAnularCativo {
  externalReference?: string
  paymentId?: number
}

export interface RespostaAnularCativo extends RespostaComum {
  paymentId?: number
}

/* ────────────────────────────────────────────────────────────────────────────
 * POST /rest/partners/external/qrCode
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PedidoQrCode {
  externalReference?: string
  acceptancePointId: number
  width?: number
  height?: number
  amount: number
  currency: string
}

export interface RespostaQrCode extends RespostaComum {
  /** Ex.: `png`. */
  imageExtension?: string
  /** A imagem em Base64. O nome do campo é do lado deles; é o conteúdo. */
  encodeToString?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * GET /rest/partners/external/payment — estado
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Comerciante {
  id?: number
  creationDate?: string
  /** O identificador que entra na cadeia assinada. */
  externalId?: string
  name?: string
  description?: string
  flow?: string
  imageUrl?: string
  enabled?: boolean
  acceptancePointId?: number
  friendlyName?: string
  email?: string
  transactionLimitList?: Array<{ amount?: number; currency?: unknown }>
}

/**
 * O pagamento, tal como o BAI o descreve.
 *
 * Não estão aqui os ramos `customerOperation`/`channel`/`movement`, que a
 * especificação arrasta do modelo interno do internet banking deles (contas,
 * balcões, clientes, tipologias de operação). São dezenas de campos que nenhuma
 * integração de pagamentos usa, e tê-los aqui era convidar alguém a depender de
 * um deles. Ficam acessíveis em bruto — `Resultado.respostaBruta` guarda a
 * resposta completa.
 */
export interface PagamentoView {
  /**
   * ⚠️ `int64`. Um `long` de Java acima de 2^53 perde precisão ao passar pelo
   * `JSON.parse`. Ver `DIVERGENCIAS.md` #C-04: a normalização verifica e avisa.
   */
  id?: number
  amount?: number
  currency?: string
  accountId?: number
  description?: string
  accountNumber?: string
  creationDate?: string
  /** Entra na cadeia assinada — ver `assinatura/hmac.ts`. */
  lastChangeDate?: string
  status?: EstadoPagamento | string
  statusDescription?: string
  statusId?: number
  paymentTypeDescription?: string
  hasReceipt?: boolean
  operationId?: number
  merchant?: Comerciante
  acceptancePointId?: number
  /** Quanto já foi devolvido. */
  totalReversed?: number
  /** Quanto ainda pode ser devolvido. */
  maxReversible?: number
  flow?: Fluxo | string
  externalReference?: string
  /** Resultado da notificação que o BAI nos tentou fazer. Ver README, "Callback". */
  callbackResult?: string
  /** Aleatório por resposta, contra repetição de mensagens. Entra na cadeia assinada. */
  nonce?: string
  /** HMAC-SHA256. Ver `assinatura/hmac.ts`. */
  signature?: string
  shoppingCart?: CarrinhoCalculado
  msisdn?: string
  estimatedAmount?: number
  maxAmount?: number
  captiveValidUntil?: string
  captiveAuthorization?: string
  captiveBranch?: string
  captiveOperationCode?: string
  productExternalId?: string
  expirationDate?: string
  merchantNotes?: string
  allowsInstallmentPayments?: boolean
  reversible?: boolean
  favorite?: boolean
  favoritable?: boolean
}

export interface RespostaEstadoPagamento extends RespostaComum {
  payment?: PagamentoView
}

/* ────────────────────────────────────────────────────────────────────────────
 * GET /rest/partners/external/msisdn/{msisdn}/validate
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RespostaValidarMsisdn extends RespostaComum {
  valid?: boolean
}

/* ────────────────────────────────────────────────────────────────────────────
 * GET /rest/partners/external/merchants/{id}/acceptancePoint/{id}
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RespostaPontoDeAceitacao extends RespostaComum {
  friendlyName?: string
}
