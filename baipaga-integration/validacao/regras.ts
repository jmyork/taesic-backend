/**
 * As regras que se conseguem verificar antes de gastar uma chamada.
 *
 * ── Porque é que isto existe, se o BAI valida na mesma ────────────────────────
 *
 * Porque quem está do outro lado é uma pessoa a pagar. Cada pedido que sai mal
 * formado custa o tempo de ida e volta, devolve `INVALID_PARAMETERS` sem dizer
 * QUAL parâmetro, e deixa o operador de caixa sem nada para corrigir. Aqui a
 * falha é imediata e diz o campo.
 *
 * E porque três dos códigos de erro do BAI —
 * `SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT`,
 * `ERROR_CALCULATING_SHOPPING_CART` e `INVALID_MSISDN_FORMAT` — são
 * inteiramente previsíveis com o que já temos em mãos.
 *
 * ── O que isto NÃO faz ────────────────────────────────────────────────────────
 *
 * Não recusa o que a especificação não proíbe. Um `totalAmount` sem carrinho é
 * legítimo; um carrinho sem IVA é legítimo; um `description` vazio é legítimo.
 * Inventar regras aqui produz recusas que ninguém consegue explicar, e a seguir
 * produz uma linha de código a desligá-las.
 */

import type { ConfiguracaoBaipaga } from '../configuracao.js'
import type {
  Carrinho,
  PedidoAnularCativo,
  PedidoCativo,
  PedidoConfirmarCativo,
  PedidoPagamento,
  PedidoPagamentoOtp,
  PedidoQrCode,
} from '../contratos/contratos.js'
import type { CodigoResposta } from '../dominio/codigos_resposta.js'
import {
  eInteiroPositivo,
  eMoeda,
  eMsisdn,
  eNumeroNaoNegativo,
  eNumeroPositivo,
  eReferenciaExterna,
  formatarMontante,
  montantesIguais,
  preenchido,
  somar,
} from './formatos.js'

export interface Violacao {
  /**
   * O código que o BAI devolveria por esta mesma falha. Escolhido de propósito
   * do catálogo deles e não de um catálogo nosso: assim uma falha apanhada aqui
   * e a mesma falha apanhada lá dão ao chamador o mesmo código, e o tratamento é
   * um só.
   */
  codigo: CodigoResposta
  campo: string
  /** A frase que diz o que está errado, com o valor. Vai para o registo. */
  detalhe: string
}

function exigirMsisdn(msisdn: unknown, violacoes: Violacao[]): void {
  if (!preenchido(msisdn)) {
    violacoes.push({
      codigo: 'INVALID_PARAMETERS',
      campo: 'customerMsisdn',
      detalhe: 'O número de telemóvel do cliente é obrigatório.',
    })
    return
  }

  if (!eMsisdn(msisdn)) {
    violacoes.push({
      codigo: 'INVALID_MSISDN_FORMAT',
      campo: 'customerMsisdn',
      detalhe: `"${String(msisdn)}" não está no formato internacional só com dígitos (ex.: 244923456789). Passar por normalizarMsisdn() antes.`,
    })
  }
}

function exigirMoeda(moeda: unknown, violacoes: Violacao[]): void {
  if (!eMoeda(moeda)) {
    violacoes.push({
      codigo: 'INVALID_CURRENCY',
      campo: 'currency',
      detalhe: `"${String(moeda)}" não é um código ISO 4217 de três letras maiúsculas.`,
    })
  }
}

function exigirReferencia(referencia: unknown, violacoes: Violacao[]): void {
  if (!eReferenciaExterna(referencia)) {
    violacoes.push({
      codigo: 'INVALID_EXTERNAL_REFERENCE',
      campo: 'externalReference',
      detalhe: preenchido(referencia)
        ? `A referência externa tem ${String(referencia).length} caracteres; o limite prudente é 120 (ver DIVERGENCIAS.md #C-05).`
        : 'A referência externa é obrigatória — é ela que identifica o pagamento do nosso lado e que impede uma segunda cobrança.',
    })
  }
}

function exigirMontante(valor: unknown, campo: string, violacoes: Violacao[]): void {
  if (!eNumeroPositivo(valor)) {
    violacoes.push({
      codigo: 'INVALID_PARAMETERS',
      campo,
      detalhe: `${campo} tem de ser um número maior que zero (recebido: ${String(valor)}).`,
    })
  }
}

/**
 * Um pagamento tem de ser identificável: ou pelo `paymentId` que o BAI deu, ou
 * pela `externalReference` que nós demos.
 *
 * A especificação declara os dois campos opcionais nas três operações que os
 * usam (consultar, confirmar cativo, anular cativo) e escreve na descrição que
 * "the payment must be identified by either paymentId or externalReference".
 * Um pedido sem nenhum dos dois é sintacticamente válido e semanticamente
 * impossível. Ver `DIVERGENCIAS.md` #C-06.
 */
export function identificacaoDoPagamento(
  pedido: { paymentId?: number; externalReference?: string },
  violacoes: Violacao[]
): void {
  const temId = eInteiroPositivo(pedido.paymentId)
  const temReferencia = preenchido(pedido.externalReference)

  if (!temId && !temReferencia) {
    violacoes.push({
      codigo: 'INVALID_PARAMETERS',
      campo: 'paymentId/externalReference',
      detalhe: 'É preciso identificar o pagamento por paymentId ou por externalReference.',
    })
  }
}

/**
 * O carrinho.
 *
 * As duas contas que o BAI refaz do lado dele e que produzem
 * `SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT`:
 *
 *   totalAmount da linha  = amountPerItem * count - discount
 *   totalCartAmount       = soma dos totalAmount das linhas
 *
 * Só se verifica o que vier preenchido. Um carrinho onde as linhas não trazem
 * `totalAmount` é um carrinho que o BAI vai calcular — e é para isso que existe
 * `calcularCarrinho()`.
 */
export function validarCarrinho(
  carrinho: Carrinho | undefined,
  cfg: ConfiguracaoBaipaga,
  violacoes: Violacao[]
): void {
  if (carrinho === undefined) return

  const linhas = carrinho.items ?? []

  if (linhas.length === 0 && preenchido(carrinho.totalCartAmount)) {
    violacoes.push({
      codigo: 'ERROR_CALCULATING_SHOPPING_CART',
      campo: 'shoppingCart.items',
      detalhe: 'O carrinho tem totais mas não tem linhas.',
    })
  }

  linhas.forEach((linha, indice) => {
    const prefixo = `shoppingCart.items[${indice}]`

    if (linha.count !== undefined && !eInteiroPositivo(linha.count)) {
      violacoes.push({
        codigo: 'INVALID_PARAMETERS',
        campo: `${prefixo}.count`,
        detalhe: `A quantidade tem de ser um inteiro maior que zero (recebido: ${String(linha.count)}).`,
      })
    }

    if (linha.amountPerItem !== undefined && !eNumeroNaoNegativo(linha.amountPerItem)) {
      violacoes.push({
        codigo: 'INVALID_PARAMETERS',
        campo: `${prefixo}.amountPerItem`,
        detalhe: `O preço unitário não pode ser negativo (recebido: ${String(linha.amountPerItem)}).`,
      })
    }

    if (linha.discount !== undefined && !eNumeroNaoNegativo(linha.discount)) {
      violacoes.push({
        codigo: 'INVALID_PARAMETERS',
        campo: `${prefixo}.discount`,
        detalhe: `O desconto não pode ser negativo (recebido: ${String(linha.discount)}).`,
      })
    }

    const podeConferir =
      typeof linha.amountPerItem === 'number' &&
      typeof linha.count === 'number' &&
      typeof linha.totalAmount === 'number'

    if (podeConferir) {
      const esperado = linha.amountPerItem! * linha.count! - (linha.discount ?? 0)

      if (!montantesIguais(esperado, linha.totalAmount!, cfg.casasDecimais)) {
        violacoes.push({
          codigo: 'SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT',
          campo: `${prefixo}.totalAmount`,
          detalhe:
            `${formatarMontante(linha.totalAmount!, cfg.casasDecimais)} não é ` +
            `preço × quantidade − desconto = ${formatarMontante(esperado, cfg.casasDecimais)}.`,
        })
      }
    }

    // A percentagem de IVA identifica-se pelo `id` da tabela do BAI, não pelo
    // valor: enviar `value: 14` sem `id` dá SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND.
    if (linha.vatPercentage !== undefined && !eInteiroPositivo(linha.vatPercentage.id)) {
      violacoes.push({
        codigo: 'SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND',
        campo: `${prefixo}.vatPercentage.id`,
        detalhe:
          'A percentagem de IVA tem de trazer o id da tabela do BAI (ver percentagensDeIva()); o valor sozinho não a identifica.',
      })
    }
  })

  if (typeof carrinho.totalCartAmount === 'number' && linhas.length > 0) {
    const soma = somar(
      linhas.map((l) => l.totalAmount),
      cfg.casasDecimais
    )

    const todasTemTotal = linhas.every((l) => typeof l.totalAmount === 'number')

    if (todasTemTotal && !montantesIguais(soma, carrinho.totalCartAmount, cfg.casasDecimais)) {
      violacoes.push({
        codigo: 'SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT',
        campo: 'shoppingCart.totalCartAmount',
        detalhe:
          `O total do carrinho (${formatarMontante(carrinho.totalCartAmount, cfg.casasDecimais)}) ` +
          `não é a soma das linhas (${formatarMontante(soma, cfg.casasDecimais)}).`,
      })
    }
  }

  if (typeof carrinho.totalCartItems === 'number' && linhas.length > 0) {
    if (carrinho.totalCartItems !== linhas.length) {
      // Aviso disfarçado de violação? Não: a especificação diz "total number of
      // items in the cart", e um número que não coincide com o array é a mesma
      // classe de erro que o `numberOfEntries` da AGT.
      violacoes.push({
        codigo: 'INVALID_PARAMETERS',
        campo: 'shoppingCart.totalCartItems',
        detalhe: `totalCartItems diz ${carrinho.totalCartItems} e o array tem ${linhas.length} linhas.`,
      })
    }
  }
}

/**
 * Um pagamento com carrinho tem de ter o total do pedido igual ao total do
 * carrinho — é literalmente o que o código
 * `SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT` diz.
 *
 * Comparamos contra `totalCartAmountWithVat` quando ele existe, porque é esse
 * que inclui o imposto e é esse que o cliente paga; com o `totalCartAmount`
 * (antes de IVA) só quando o outro não vier.
 */
function conferirTotalContraCarrinho(
  totalAmount: number,
  carrinho: Carrinho | undefined,
  cfg: ConfiguracaoBaipaga,
  violacoes: Violacao[]
): void {
  if (carrinho === undefined) return

  const totalDoCarrinho =
    typeof carrinho.totalCartAmountWithVat === 'number'
      ? carrinho.totalCartAmountWithVat
      : carrinho.totalCartAmount

  if (typeof totalDoCarrinho !== 'number') return

  if (!montantesIguais(totalAmount, totalDoCarrinho, cfg.casasDecimais)) {
    violacoes.push({
      codigo: 'SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT',
      campo: 'totalAmount',
      detalhe:
        `O total a cobrar (${formatarMontante(totalAmount, cfg.casasDecimais)}) não coincide com o ` +
        `total do carrinho (${formatarMontante(totalDoCarrinho, cfg.casasDecimais)}).`,
    })
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Uma função por operação
 * ──────────────────────────────────────────────────────────────────────────── */

export function validarPedidoPagamento(
  pedido: PedidoPagamento,
  cfg: ConfiguracaoBaipaga
): Violacao[] {
  const violacoes: Violacao[] = []

  exigirMsisdn(pedido.customerMsisdn, violacoes)
  exigirMontante(pedido.totalAmount, 'totalAmount', violacoes)
  exigirMoeda(pedido.currency, violacoes)
  exigirReferencia(pedido.externalReference, violacoes)
  validarCarrinho(pedido.shoppingCart, cfg, violacoes)

  if (eNumeroPositivo(pedido.totalAmount)) {
    conferirTotalContraCarrinho(pedido.totalAmount, pedido.shoppingCart, cfg, violacoes)
  }

  return violacoes
}

export function validarPedidoOtp(pedido: PedidoPagamentoOtp, cfg: ConfiguracaoBaipaga): Violacao[] {
  const violacoes: Violacao[] = []

  exigirMsisdn(pedido.customerMsisdn, violacoes)
  exigirMontante(pedido.totalAmount, 'totalAmount', violacoes)
  exigirMoeda(pedido.currency, violacoes)
  exigirReferencia(pedido.externalReference, violacoes)
  validarCarrinho(pedido.shoppingCart, cfg, violacoes)

  if (eNumeroPositivo(pedido.totalAmount)) {
    conferirTotalContraCarrinho(pedido.totalAmount, pedido.shoppingCart, cfg, violacoes)
  }

  return violacoes
}

export function validarCativo(pedido: PedidoCativo, cfg: ConfiguracaoBaipaga): Violacao[] {
  const violacoes: Violacao[] = []

  exigirMsisdn(pedido.customerMsisdn, violacoes)
  exigirMontante(pedido.estimatedAmount, 'estimatedAmount', violacoes)
  exigirMontante(pedido.maxAmount, 'maxAmount', violacoes)
  exigirMoeda(pedido.currency, violacoes)
  exigirReferencia(pedido.externalReference, violacoes)
  validarCarrinho(pedido.shoppingCart, cfg, violacoes)

  // A regra que a especificação escreve por extenso: "maxAmount must be >=
  // estimatedAmount". Apanhá-la aqui poupa uma pré-autorização recusada com o
  // cliente à espera.
  if (eNumeroPositivo(pedido.estimatedAmount) && eNumeroPositivo(pedido.maxAmount)) {
    if (pedido.maxAmount < pedido.estimatedAmount) {
      violacoes.push({
        codigo: 'INVALID_PARAMETERS',
        campo: 'maxAmount',
        detalhe:
          `O valor máximo (${formatarMontante(pedido.maxAmount, cfg.casasDecimais)}) é inferior ao ` +
          `estimado (${formatarMontante(pedido.estimatedAmount, cfg.casasDecimais)}).`,
      })
    }
  }

  return violacoes
}

/**
 * Confirmação de um cativo.
 *
 * `maxAmountConhecido` é opcional porque nem sempre se tem à mão — quem o
 * tiver (da criação, ou de uma consulta de estado) ganha aqui a verificação de
 * que o `finalAmount` cabe no tecto autorizado, que é a recusa mais provável
 * desta operação.
 */
export function validarConfirmarCativo(
  pedido: PedidoConfirmarCativo,
  cfg: ConfiguracaoBaipaga,
  maxAmountConhecido?: number
): Violacao[] {
  const violacoes: Violacao[] = []

  identificacaoDoPagamento(pedido, violacoes)
  exigirMontante(pedido.finalAmount, 'finalAmount', violacoes)

  if (
    eNumeroPositivo(pedido.finalAmount) &&
    typeof maxAmountConhecido === 'number' &&
    pedido.finalAmount > maxAmountConhecido
  ) {
    violacoes.push({
      codigo: 'INVALID_PARAMETERS',
      campo: 'finalAmount',
      detalhe:
        `O valor final (${formatarMontante(pedido.finalAmount, cfg.casasDecimais)}) excede o máximo ` +
        `autorizado na pré-autorização (${formatarMontante(maxAmountConhecido, cfg.casasDecimais)}).`,
    })
  }

  return violacoes
}

export function validarAnularCativo(pedido: PedidoAnularCativo): Violacao[] {
  const violacoes: Violacao[] = []
  identificacaoDoPagamento(pedido, violacoes)
  return violacoes
}

export function validarQrCode(pedido: PedidoQrCode): Violacao[] {
  const violacoes: Violacao[] = []

  if (!eInteiroPositivo(pedido.acceptancePointId)) {
    violacoes.push({
      codigo: 'INVALID_PARAMETERS',
      campo: 'acceptancePointId',
      detalhe:
        'O ponto de aceitação é obrigatório (configurar BAIPAGA_ACCEPTANCE_POINT_ID ou passá-lo na chamada).',
    })
  }

  exigirMontante(pedido.amount, 'amount', violacoes)
  exigirMoeda(pedido.currency, violacoes)

  for (const campo of ['width', 'height'] as const) {
    const valor = pedido[campo]
    if (valor !== undefined && !eInteiroPositivo(valor)) {
      violacoes.push({
        codigo: 'INVALID_PARAMETERS',
        campo,
        detalhe: `${campo} tem de ser um inteiro maior que zero (recebido: ${String(valor)}).`,
      })
    }
  }

  return violacoes
}

export function validarConsulta(criterio: {
  paymentId?: number
  externalReference?: string
}): Violacao[] {
  const violacoes: Violacao[] = []
  identificacaoDoPagamento(criterio, violacoes)
  return violacoes
}
