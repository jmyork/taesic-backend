/**
 * As três assinaturas do Blueprint.
 *
 * ── O que o documento diz, e o que não diz ────────────────────────────────────
 *
 * Diz QUE campos entram em cada assinatura e COM QUE chave. Não diz o formato do
 * payload assinado (objecto JSON? concatenação? por que ordem?), nem o algoritmo,
 * nem se o resultado é um JWS compacto ou a assinatura crua. E declara os três
 * campos com `"minlength": 256` E `"maxlength": 256` — exactamente 256
 * caracteres.
 *
 * Esse último número não fecha com nada. Uma assinatura RS256 com chave de 2048
 * bits são 256 BYTES, que em base64url dão 342 caracteres — e um JWS compacto
 * ainda leva o cabeçalho e o payload à frente. 256 caracteres é o comprimento da
 * assinatura crua em hexadecimal truncada, ou o número de bytes confundido com o
 * número de caracteres. Não dá para adivinhar qual.
 *
 * ── O que este ficheiro faz com isso ──────────────────────────────────────────
 *
 * Não adivinha. A assinatura é uma ESTRATÉGIA substituível: `JwsCompactoRs256` é
 * a leitura mais provável ("jws" está no nome dos três campos) e é a omissão;
 * quando a AGT esclarecer, escreve-se outra classe e troca-se uma linha, sem
 * tocar no cliente nem nos validadores.
 *
 * O comprimento é VERIFICADO e reportado, nunca corrigido em silêncio: truncar
 * uma assinatura para caber em 256 caracteres produz um campo com o tamanho
 * certo e criptograficamente inútil, que a AGT rejeita com E08 sem dizer porquê.
 * Ver `DIVERGENCIAS.md` #C-03.
 */

import { createHash, createSign } from 'node:crypto'
import type {
  Documento,
  PedidoConfirmarRejeitar,
  PedidoConsultarFactura,
  PedidoListarFacturas,
  PedidoListarSeries,
  PedidoObterEstado,
  PedidoSolicitarSerie,
  SoftwareInfoDetalhes,
} from '../contratos/contratos.js'

/** Comprimento que o documento declara para os três campos de assinatura. */
export const COMPRIMENTO_DECLARADO = 256

export interface EstrategiaDeAssinatura {
  readonly nome: string
  assinar(payload: Record<string, unknown>, chavePrivadaPem: string): string
}

function base64url(dados: Buffer | string): string {
  return Buffer.from(dados)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * JWS compacto RS256: `base64url(header).base64url(payload).base64url(assinatura)`.
 *
 * A ordem das chaves do payload é a ordem por que foram inseridas no objecto —
 * `JSON.stringify` preserva-a para chaves não numéricas. Os construtores de
 * payload abaixo inserem-nas pela ordem EXACTA em que o documento as lista, e
 * isso não é cosmético: quem verifica do outro lado reconstrói a mesma cadeia, e
 * uma ordem diferente dá uma assinatura diferente sobre os mesmos dados.
 */
export class JwsCompactoRs256 implements EstrategiaDeAssinatura {
  readonly nome = 'JWS compacto RS256'

  assinar(payload: Record<string, unknown>, chavePrivadaPem: string): string {
    if (!chavePrivadaPem) {
      throw new Error(
        'Assinatura pedida sem chave privada. Ver MINFIN_CHAVE_PRODUTOR / MINFIN_CHAVE_EMISSOR em minfin-integration/README.md.'
      )
    }

    const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const corpo = base64url(JSON.stringify(payload))
    const assinatura = createSign('RSA-SHA256')
      .update(`${cabecalho}.${corpo}`)
      .sign(chavePrivadaPem)

    return `${cabecalho}.${corpo}.${base64url(assinatura)}`
  }
}

/**
 * Estratégia determinística SEM criptografia assimétrica, para o simulador e
 * para os testes.
 *
 * Produz exactamente 256 caracteres — o comprimento que o documento declara —
 * porque assim os testes de comprimento exercitam o caminho "cabe" além do
 * caminho "não cabe". Não protege nada e não deve sair de um ambiente de teste;
 * `assinar()` recusa-se a correr com `NODE_ENV=production`.
 */
export class AssinaturaSimulada implements EstrategiaDeAssinatura {
  readonly nome = 'simulada (SHA-256 expandido, sem valor criptográfico)'

  assinar(payload: Record<string, unknown>, _chavePrivadaPem: string): string {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AssinaturaSimulada não pode ser usada em produção.')
    }

    const canonico = JSON.stringify(payload)
    let acumulado = ''
    let semente = canonico

    // Quatro digests de 64 hex = 256 caracteres exactos.
    while (acumulado.length < COMPRIMENTO_DECLARADO) {
      semente = createHash('sha256').update(semente).digest('hex')
      acumulado += semente
    }

    return acumulado.slice(0, COMPRIMENTO_DECLARADO)
  }
}

export interface DiagnosticoDeComprimento {
  comprimento: number
  cabeNoDeclarado: boolean
  aviso: string | null
}

/**
 * Verifica o comprimento contra o que o documento declara — e devolve um aviso,
 * não uma excepção. Uma assinatura demasiado longa é um problema de
 * interoperabilidade por resolver com a AGT, não um erro de programação nosso, e
 * bloquear a emissão de facturas por causa dele seria pior do que enviá-la.
 */
export function verificarComprimento(assinatura: string): DiagnosticoDeComprimento {
  const comprimento = assinatura.length
  const cabe = comprimento === COMPRIMENTO_DECLARADO

  if (cabe) return { comprimento, cabeNoDeclarado: true, aviso: null }

  return {
    comprimento,
    cabeNoDeclarado: false,
    aviso:
      `Assinatura com ${comprimento} caracteres; o Blueprint declara "minlength" e "maxlength" ambos ${COMPRIMENTO_DECLARADO}. ` +
      'Nenhuma assinatura RS256 cabe em 256 caracteres — é uma contradição do documento (DIVERGENCIAS.md #C-03), ' +
      'a confirmar com a AGT. A assinatura NÃO foi truncada.',
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Construtores de payload — a ordem das chaves é a do documento
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `jwsSoftwareSignature` (1.1.2.1): "todos os campos do objecto softwareInfo",
 * com a chave privada do PRODUTOR.
 *
 * "Todos os campos de softwareInfo" inclui-se a si próprio, o que é impossível —
 * lê-se como os campos dos DETALHES, o único conteúdo de `softwareInfo` além da
 * assinatura.
 */
export function payloadSoftware(detalhes: SoftwareInfoDetalhes): Record<string, unknown> {
  return { ...detalhes }
}

/**
 * `jwsDocumentSignature` (1.1.2.4), com a chave privada do EMISSOR. Os oito
 * campos, pela ordem listada:
 * documentNo, taxRegistrationNumber, documentType, documentDate, customerTaxID,
 * customerCountry, companyName, documentTotals.
 *
 * `taxRegistrationNumber` não é campo do documento — é o NIF do emissor, que
 * está no envelope. Por isso entra como argumento.
 */
export function payloadDocumento(
  documento: Omit<Documento, 'jwsDocumentSignature'>,
  taxRegistrationNumber: string
): Record<string, unknown> {
  return {
    documentNo: documento.documentNo,
    taxRegistrationNumber,
    documentType: documento.documentType,
    documentDate: documento.documentDate,
    customerTaxID: documento.customerTaxID,
    customerCountry: documento.customerCountry,
    companyName: documento.companyName,
    documentTotals: documento.documentTotals,
  }
}

/** `jwsSignature` de `obterEstado` (1.2.2): taxRegistrationNumber, requestID. */
export function payloadObterEstado(
  p: Pick<PedidoObterEstado, 'taxRegistrationNumber' | 'requestID'>
) {
  return { taxRegistrationNumber: p.taxRegistrationNumber, requestID: p.requestID }
}

/** `jwsSignature` de `listarFacturas` (1.3.2): NIF, queryStartDate, queryEndDate. */
export function payloadListarFacturas(
  p: Pick<PedidoListarFacturas, 'taxRegistrationNumber' | 'queryStartDate' | 'queryEndDate'>
) {
  return {
    taxRegistrationNumber: p.taxRegistrationNumber,
    queryStartDate: p.queryStartDate,
    queryEndDate: p.queryEndDate,
  }
}

/** `jwsSignature` de `consultarFactura` (1.4.2): NIF, documentNo. */
export function payloadConsultarFactura(
  p: Pick<PedidoConsultarFactura, 'taxRegistrationNumber' | 'documentNo'>
) {
  return { taxRegistrationNumber: p.taxRegistrationNumber, documentNo: p.documentNo }
}

/**
 * `jwsSignature` de `solicitarSerie` (1.5.2): NIF, seriesCode, seriesYear,
 * documentType, firstDocumentNumber.
 */
export function payloadSolicitarSerie(
  p: Pick<
    PedidoSolicitarSerie,
    'taxRegistrationNumber' | 'seriesCode' | 'seriesYear' | 'documentType' | 'firstDocumentNumber'
  >
) {
  return {
    taxRegistrationNumber: p.taxRegistrationNumber,
    seriesCode: p.seriesCode,
    seriesYear: p.seriesYear,
    documentType: p.documentType,
    firstDocumentNumber: p.firstDocumentNumber,
  }
}

/**
 * `jwsSignature` de `listarSeries` (1.6.2).
 *
 * ⚠️ O documento manda assinar "taxRegistrationNumber" e "documentNo" — e
 * `listarSeries` NÃO TEM campo `documentNo`. É texto copiado de
 * `consultarFactura`, onde a mesma frase faz sentido. Ver `DIVERGENCIAS.md`
 * #C-14.
 *
 * Assinamos o NIF sozinho: é o único dos dois campos que existe neste pedido, e
 * inventar um `documentNo` vazio ou nulo só para preencher a fórmula produziria
 * uma assinatura sobre um valor que ninguém do outro lado sabe reconstruir.
 */
export function payloadListarSeries(p: Pick<PedidoListarSeries, 'taxRegistrationNumber'>) {
  return { taxRegistrationNumber: p.taxRegistrationNumber }
}

/** `jwsSignature` de `confirmarRejeitarDocumento` (1.7.2): NIF, documentNo. */
export function payloadConfirmarRejeitar(
  p: Pick<PedidoConfirmarRejeitar, 'taxRegistrationNumber' | 'documentNo'>
) {
  return { taxRegistrationNumber: p.taxRegistrationNumber, documentNo: p.documentNo }
}
