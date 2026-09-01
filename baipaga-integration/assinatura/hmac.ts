/**
 * A assinatura das respostas de estado.
 *
 * ── O que a especificação diz, e o que não diz ────────────────────────────────
 *
 * Diz isto, e só isto, na descrição de `MobilePaymentView.signature`:
 *
 *   HMAC-SHA256 signature for message authenticity. Computed as
 *   HMAC(sharedKey, id|nonce|externalReference|amount|lastChangeDate|merchant.externalId)
 *
 * Fica escrito: o algoritmo, a chave, os campos e a ordem. Fica por escrever
 * tudo o que decide se a verificação bate:
 *
 *  1. Como se escreve o `amount`, que em JSON é um NÚMERO. `1500`, `1500.0` e
 *     `1500.00` são o mesmo número e três cadeias diferentes — e o `JSON.parse`
 *     do Node reduz as três a `1500`, perdendo a forma original.
 *  2. Em que codificação vem a assinatura: hexadecimal ou Base64.
 *  3. O que fazer quando um dos seis campos vem ausente ou nulo — cadeia vazia
 *     entre dois separadores, ou o literal `null`?
 *  4. Onde é que a `sharedKey` é acordada. Não aparece em nenhum lado da
 *     especificação; chega por fora, no acordo de integração.
 *
 * ── O que este ficheiro faz com isso ──────────────────────────────────────────
 *
 * Não adivinha, e sobretudo não falha em silêncio nem passa em silêncio.
 *
 *  1. O montante é uma ESTRATÉGIA enumerada (`FORMATOS_DE_MONTANTE`). Em
 *     `auto`, tenta as três e diz num aviso qual bateu, para se poder fixar em
 *     `BAIPAGA_CANONICALIZACAO`. Isto não enfraquece nada: produzir qualquer das
 *     três continua a exigir a chave partilhada.
 *  2. A codificação é DEDUZIDA da forma da assinatura recebida — 64 caracteres
 *     hexadecimais só podem ser hex, 44 caracteres Base64 só podem ser Base64.
 *     Não há aqui nada a configurar porque não há nada a escolher.
 *  3. Campos ausentes viram cadeia vazia, que é a leitura mais comum de um
 *     `String.join` sobre valores nulos em Java. É uma escolha, e está em
 *     `DIVERGENCIAS.md` #A-02.
 *  4. Sem chave, a verificação não corre e diz que não correu. NUNCA devolve
 *     "válida" por não ter tido com que verificar — uma verificação que passa por
 *     omissão é pior do que não existir, porque quem a lê acredita nela.
 *
 * ── E a razão de tudo isto ────────────────────────────────────────────────────
 *
 * A resposta de estado é o que decide se se entrega mercadoria. Sem a assinatura
 * verificada, quem conseguir responder no lugar do BAI — um DNS envenenado, um
 * proxy comprometido, um ambiente de testes mal apontado — consegue dizer
 * `SUCCESS` sobre um pagamento que nunca existiu.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Canonicalizacao } from '../configuracao.js'

/** Os seis campos que entram na cadeia, pela ordem em que a especificação os lista. */
export interface CamposAssinados {
  id: number | string | null | undefined
  nonce: string | null | undefined
  externalReference: string | null | undefined
  amount: number | null | undefined
  lastChangeDate: string | null | undefined
  /** Vem da configuração, NUNCA da resposta que se está a verificar. */
  merchantExternalId: string
}

/** O separador que a fórmula escreve. */
export const SEPARADOR = '|'

export type FormatoDeMontante = 'montante-simples' | 'montante-1-casa' | 'montante-2-casas'

/** As três leituras possíveis de um montante. Ver o cabeçalho e #A-01. */
export const FORMATOS_DE_MONTANTE: readonly FormatoDeMontante[] = [
  'montante-simples',
  'montante-1-casa',
  'montante-2-casas',
] as const

function escreverMontante(valor: number | null | undefined, formato: FormatoDeMontante): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return ''

  switch (formato) {
    case 'montante-simples':
      return String(valor)
    case 'montante-1-casa':
      return valor.toFixed(1)
    case 'montante-2-casas':
      return valor.toFixed(2)
  }
}

function escreverTexto(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor)
}

/**
 * A cadeia que vai ser passada pelo HMAC.
 *
 * Pública para que um teste possa afirmar exactamente o que se assina, e para
 * que quem esteja a acertar a integração com o BAI possa mostrar-lhes a cadeia
 * que o nosso lado construiu.
 */
export function cadeiaAssinada(campos: CamposAssinados, formato: FormatoDeMontante): string {
  return [
    escreverTexto(campos.id),
    escreverTexto(campos.nonce),
    escreverTexto(campos.externalReference),
    escreverMontante(campos.amount, formato),
    escreverTexto(campos.lastChangeDate),
    escreverTexto(campos.merchantExternalId),
  ].join(SEPARADOR)
}

export type Codificacao = 'hex' | 'base64'

/**
 * Deduz a codificação pela forma da assinatura recebida.
 *
 * Um HMAC-SHA256 são 32 bytes: 64 caracteres em hexadecimal, 44 em Base64 (com
 * o `=` final) ou 43 sem preenchimento. Nenhuma cadeia é as duas coisas — 64
 * caracteres hexadecimais nunca são 32 bytes em Base64 — por isso isto não é uma
 * heurística com casos ambíguos, é uma leitura do comprimento.
 */
export function deduzirCodificacao(assinatura: string): Codificacao | null {
  const limpa = assinatura.trim()

  if (/^[0-9a-fA-F]{64}$/.test(limpa)) return 'hex'
  if (/^[A-Za-z0-9+/]{43}=?$/.test(limpa) || /^[A-Za-z0-9\-_]{43}=?$/.test(limpa)) return 'base64'

  return null
}

/** O HMAC-SHA256 da cadeia, na codificação pedida. */
export function assinar(
  campos: CamposAssinados,
  chavePartilhada: string,
  formato: FormatoDeMontante,
  codificacao: Codificacao = 'hex'
): string {
  if (!chavePartilhada) {
    throw new Error(
      'Assinatura pedida sem chave partilhada. Ver BAIPAGA_CHAVE_PARTILHADA em baipaga-integration/README.md.'
    )
  }

  return createHmac('sha256', chavePartilhada)
    .update(cadeiaAssinada(campos, formato), 'utf8')
    .digest(codificacao)
}

/**
 * Comparação em tempo constante.
 *
 * Um `===` sobre duas cadeias pára no primeiro carácter diferente, e o tempo que
 * demora conta quantos caracteres iniciais estavam certos. Com respostas
 * suficientes, isso permite construir uma assinatura válida carácter a carácter
 * sem nunca ter tido a chave. O `timingSafeEqual` compara sempre tudo.
 *
 * O comprimento não é segredo (é o do algoritmo), por isso comparar comprimentos
 * antes não perde nada — e é preciso, porque o `timingSafeEqual` lança se forem
 * diferentes.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const A = Buffer.from(a, 'utf8')
  const B = Buffer.from(b, 'utf8')
  if (A.length !== B.length) return false
  return timingSafeEqual(A, B)
}

export interface ResultadoDaVerificacao {
  /** `true` só quando o HMAC bateu. Nunca `true` por falta de dados. */
  valida: boolean
  /** Qual dos formatos de montante bateu. `null` quando nenhum bateu. */
  formato: FormatoDeMontante | null
  codificacao: Codificacao | null
  /**
   * Porque é que não se pôde verificar, quando não se pôde. Distinto de
   * "verificou-se e não bate": os dois têm `valida: false` e consequências
   * diferentes, e é isto que os separa.
   */
  naoVerificavel: string | null
}

export interface OpcoesDeVerificacao {
  assinatura: string | null | undefined
  campos: CamposAssinados
  chavePartilhada: string | null
  /** `auto` tenta os três formatos; qualquer outro valor fixa um. */
  canonicalizacao: Canonicalizacao
  /**
   * Candidatos adicionais para o montante, em texto, extraídos do corpo em
   * bruto — ver `montantesCrusDaResposta()`. Cobrem o caso em que o BAI escreve
   * o montante de uma forma que nenhum dos três formatos reproduz.
   */
  montantesAlternativos?: string[]
}

/**
 * Verifica a assinatura de uma resposta de estado.
 *
 * Devolve, nunca lança: uma assinatura que não bate é um facto sobre a resposta,
 * não um erro de programação, e quem chama tem de decidir o que fazer com ela.
 */
export function verificar(opcoes: OpcoesDeVerificacao): ResultadoDaVerificacao {
  const vazio: ResultadoDaVerificacao = {
    valida: false,
    formato: null,
    codificacao: null,
    naoVerificavel: null,
  }

  if (!opcoes.chavePartilhada) {
    return { ...vazio, naoVerificavel: 'Não há chave partilhada configurada (BAIPAGA_CHAVE_PARTILHADA).' }
  }

  if (!opcoes.campos.merchantExternalId) {
    return {
      ...vazio,
      naoVerificavel:
        'Não há merchantExternalId configurado (BAIPAGA_MERCHANT_EXTERNAL_ID). Usar o que vem na resposta tornaria a verificação inútil.',
    }
  }

  const assinatura = opcoes.assinatura?.trim()
  if (!assinatura) {
    return { ...vazio, naoVerificavel: 'A resposta não trouxe assinatura.' }
  }

  const codificacao = deduzirCodificacao(assinatura)
  if (codificacao === null) {
    return {
      ...vazio,
      naoVerificavel: `A assinatura recebida não tem a forma de um HMAC-SHA256 (${assinatura.length} caracteres, nem hexadecimal nem Base64).`,
    }
  }

  const formatos =
    opcoes.canonicalizacao === 'auto' ? FORMATOS_DE_MONTANTE : [opcoes.canonicalizacao as FormatoDeMontante]

  for (const formato of formatos) {
    const calculada = assinar(opcoes.campos, opcoes.chavePartilhada, formato, codificacao)
    if (iguaisEmTempoConstante(calculada, assinatura)) {
      return { valida: true, formato, codificacao, naoVerificavel: null }
    }
  }

  // Último recurso: o montante escrito tal como veio no corpo em bruto. Só se
  // chega aqui quando nenhum dos formatos previstos bateu.
  for (const montante of opcoes.montantesAlternativos ?? []) {
    const cadeia = [
      escreverTexto(opcoes.campos.id),
      escreverTexto(opcoes.campos.nonce),
      escreverTexto(opcoes.campos.externalReference),
      montante,
      escreverTexto(opcoes.campos.lastChangeDate),
      escreverTexto(opcoes.campos.merchantExternalId),
    ].join(SEPARADOR)

    const calculada = createHmac('sha256', opcoes.chavePartilhada)
      .update(cadeia, 'utf8')
      .digest(codificacao)

    if (iguaisEmTempoConstante(calculada, assinatura)) {
      return { valida: true, formato: null, codificacao, naoVerificavel: null }
    }
  }

  return { valida: false, formato: null, codificacao, naoVerificavel: null }
}

/**
 * Os montantes tal como aparecem, em texto, no corpo em bruto da resposta.
 *
 * Existe por causa do que o `JSON.parse` deita fora: `1500.00` vira `1500`, e
 * com ele desaparece a única prova de como o BAI escreveu o número quando o
 * assinou. Isto vai buscar os tokens originais.
 *
 * ⚠️ `"amount"` aparece mais do que uma vez na resposta — o pagamento tem um, e
 * cada limite de transacção do comerciante tem outro. Não há forma de saber, com
 * uma expressão regular, qual pertence ao pagamento. Por isso isto devolve
 * TODOS os candidatos distintos e a verificação experimenta-os; e por isso é o
 * último recurso e não o primeiro.
 */
export function montantesCrusDaResposta(corpoBruto: string): string[] {
  const encontrados = new Set<string>()

  for (const par of corpoBruto.matchAll(/"amount"\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) {
    encontrados.add(par[1])
  }

  return [...encontrados]
}

/**
 * Ferramenta de calibração: dada uma resposta real, diz qual das leituras bate.
 *
 * Serve para se correr uma vez contra o ambiente de qualidade do BAI e fixar
 * `BAIPAGA_CANONICALIZACAO`, fechando a ambiguidade #A-01 em vez de a arrastar.
 */
export function descobrirFormato(opcoes: Omit<OpcoesDeVerificacao, 'canonicalizacao'>): {
  formato: FormatoDeMontante | 'cru' | null
  codificacao: Codificacao | null
  cadeiaExperimentada: string[]
} {
  const cadeias = FORMATOS_DE_MONTANTE.map((f) => cadeiaAssinada(opcoes.campos, f))
  const resultado = verificar({ ...opcoes, canonicalizacao: 'auto' })

  return {
    formato: resultado.valida ? (resultado.formato ?? 'cru') : null,
    codificacao: resultado.codificacao,
    cadeiaExperimentada: cadeias,
  }
}
