/**
 * A leitura das respostas.
 *
 * ── Porque é que isto não é `corpo as RespostaX` ──────────────────────────────
 *
 * Porque um `as` é uma promessa que o TypeScript acredita e o JSON não cumpre.
 * A especificação não declara `required` em nenhum objecto de saída: todos os
 * campos de todas as respostas são, pela letra dela, opcionais. Um `as` sobre
 * isso põe `undefined` a atravessar meia aplicação com o tipo de um `number`.
 *
 * Cada função aqui devolve `null` quando o corpo não tem a forma que a
 * especificação descreve, e o cliente transforma esse `null` num
 * `resposta-invalida` com a resposta bruta guardada. Um erro que aponta para a
 * resposta que o causou vale mais do que um `TypeError` três funções acima.
 */

import type {
  CarrinhoCalculado,
  PagamentoView,
  PercentagemIva,
} from '../contratos/contratos.js'

function objecto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

/**
 * O `responseCode`, seja ele texto ou número.
 *
 * Devolve sempre uma cadeia. Um `responseCode` ausente vira `'UNKNOWN'` e não
 * `'OK'` — a ausência de um veredicto nunca pode ser lida como veredicto
 * favorável quando o que está em causa é se houve pagamento.
 */
export function lerCodigoResposta(corpo: unknown): string {
  const raiz = objecto(corpo)
  if (raiz === null) return 'UNKNOWN'

  const codigo = raiz.responseCode
  if (typeof codigo === 'string' && codigo.trim() !== '') return codigo.trim()
  if (typeof codigo === 'number') return String(codigo)

  return 'UNKNOWN'
}

export function lerMensagem(corpo: unknown): string | null {
  const raiz = objecto(corpo)
  const mensagem = raiz?.message
  return typeof mensagem === 'string' && mensagem.trim() !== '' ? mensagem.trim() : null
}

function inteiroOuNulo(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** `paymentId` das quatro respostas que o devolvem. */
export function lerPaymentId(corpo: unknown): number | null {
  return inteiroOuNulo(objecto(corpo)?.paymentId)
}

export function lerExpirationDate(corpo: unknown): string | null {
  return textoOuNulo(objecto(corpo)?.expirationDate)
}

export function lerConfirmationUrl(corpo: unknown): string | null {
  return textoOuNulo(objecto(corpo)?.confirmationUrl)
}

/**
 * O pagamento de `GET /payment`.
 *
 * Exige `payment` e que ele traga um `status` — sem estado não há resposta útil,
 * e devolver um objecto vazio deixaria o chamador a decidir sobre um pagamento
 * de que não sabe nada.
 */
export function lerPagamento(corpo: unknown): PagamentoView | null {
  const pagamento = objecto(objecto(corpo)?.payment)
  if (pagamento === null) return null
  if (typeof pagamento.status !== 'string' || pagamento.status.trim() === '') return null

  return pagamento as PagamentoView
}

export function lerCarrinhoCalculado(corpo: unknown): CarrinhoCalculado | null {
  const carrinho = objecto(objecto(corpo)?.shoppingCart)
  return carrinho === null ? null : (carrinho as CarrinhoCalculado)
}

export function lerPercentagensIva(corpo: unknown): PercentagemIva[] | null {
  const lista = objecto(corpo)?.cartItemVatPercentageViewList
  if (!Array.isArray(lista)) return null

  return lista.filter((item) => objecto(item) !== null) as PercentagemIva[]
}

export interface QrCodeLido {
  /** A imagem em Base64, tal como veio. */
  base64: string
  /** Ex.: `png`. `null` quando o BAI não o disser. */
  extensao: string | null
  /** Pronto a usar em `<img src>`. */
  dataUri: string
}

/**
 * O QR Code.
 *
 * Monta também o `data:` URI porque é isso que o consumidor quer e porque a
 * alternativa é cada sítio que mostra um QR ter de saber que a extensão vem
 * num campo separado — e acertar no `image/png` a partir de `"png"`.
 */
export function lerQrCode(corpo: unknown): QrCodeLido | null {
  const raiz = objecto(corpo)
  const base64 = textoOuNulo(raiz?.encodeToString)
  if (base64 === null) return null

  const extensao = textoOuNulo(raiz?.imageExtension)?.toLowerCase().replace(/^\./, '') ?? null
  const tipo = extensao === 'svg' ? 'image/svg+xml' : `image/${extensao ?? 'png'}`

  return { base64, extensao, dataUri: `data:${tipo};base64,${base64}` }
}

/**
 * O resultado da validação de um número.
 *
 * `valid` ausente devolve `null` e não `false`: "o BAI não respondeu se o número
 * serve" e "o BAI disse que o número não serve" levam a acções diferentes, e
 * colapsá-los faz recusar clientes por uma resposta malformada.
 */
export function lerValidacaoMsisdn(corpo: unknown): { valido: boolean } | null {
  const valido = objecto(corpo)?.valid
  return typeof valido === 'boolean' ? { valido } : null
}

export function lerPontoDeAceitacao(corpo: unknown): { friendlyName: string } | null {
  const nome = textoOuNulo(objecto(corpo)?.friendlyName)
  return nome === null ? null : { friendlyName: nome }
}

/**
 * Avisos sobre precisão numérica.
 *
 * O `id` do pagamento é um `int64`. O `JSON.parse` do Node lê números como
 * `double`, e um `double` só representa inteiros exactos até 2^53−1
 * (9 007 199 254 740 991). Acima disso o valor lido difere do valor enviado —
 * em silêncio, sem erro nenhum, e com uma diferença pequena o bastante para
 * passar despercebida até alguém consultar um pagamento que não existe.
 *
 * Não há aqui nada a corrigir sem trocar o `JSON.parse` por um analisador que
 * preserve inteiros grandes. O que há é dizê-lo em voz alta quando acontecer, e
 * a `externalReference` — que é texto e é nossa — como identificador alternativo
 * que não tem este problema.
 */
export function avisosDePrecisao(pagamento: PagamentoView | null): string[] {
  const avisos: string[] = []

  if (pagamento?.id !== undefined && !Number.isSafeInteger(pagamento.id)) {
    avisos.push(
      `O paymentId (${pagamento.id}) excede o inteiro exacto do JavaScript e pode ter perdido precisão na leitura. ` +
        'Usar a externalReference para identificar este pagamento.'
    )
  }

  return avisos
}
