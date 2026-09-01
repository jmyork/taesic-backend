/**
 * As formas JSON dos sete serviços, tal como o Blueprint as define.
 *
 * Tipos, e só tipos — nada aqui corre. Servem para que um campo trocado seja um
 * erro de compilação e não uma rejeição da AGT três dias depois.
 *
 * ── Um aviso que vale para o ficheiro inteiro ─────────────────────────────────
 *
 * O documento descreve cada serviço DUAS vezes: um exemplo de JSON na secção
 * "Características do Serviço", e uma tabela de campos nas secções
 * "Parâmetros"/"Composição". Os dois não coincidem. Onde divergem, os tipos aqui
 * seguem as TABELAS (são normativas e completas) e o código que constrói/lê os
 * payloads aceita as duas grafias, com a escolha do que EMITIR feita em
 * `configuracao.ts` (`nomenclatura`). Cada divergência tem um número em
 * `DIVERGENCIAS.md`.
 */

import type { TipoDocumento } from '../dominio/tipos_documento.js'
import type {
  AccaoAdquirente,
  EstadoDocumento,
  EstadoSerie,
  MetodoFacturacao,
  MotivoAnulacao,
  ResultadoAccao,
  ResultadoProcessamento,
  VeredictoDocumento,
} from '../dominio/estados.js'
import type { TipoImposto, TipoRetencao } from '../dominio/impostos.js'

/* ────────────────────────────────────────────────────────────────────────────
 * Envelope comum
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Detalhes do software, na grafia dos EXEMPLOS do documento.
 *
 * É esta a grafia por omissão. Duas razões: os exemplos são o único sítio onde
 * se vê o JSON inteiro montado, e a tabela de erros nomeia `"softwareValidationNo"`
 * no texto do E07 — ou seja, dá razão aos exemplos contra a sua própria tabela
 * de campos. Ver #C-02.
 */
export interface SoftwareInfoDetalhesExemplo {
  softwareName: string
  softwareVersion: string
  softwareValidationNo: string
}

/** Os mesmos três valores, na grafia da TABELA 1.1.2.2. */
export interface SoftwareInfoDetalhesTabela {
  productId: string
  productVersion: string
  softwareValidationNumber: string
}

export type SoftwareInfoDetalhes = SoftwareInfoDetalhesExemplo | SoftwareInfoDetalhesTabela

/**
 * `softwareInfo` (1.1.2.1).
 *
 * A chave interna é `softwareInfoDetails` nos exemplos e `softwareInfoDetail`
 * (singular) na tabela. As duas estão declaradas como opcionais para que o tipo
 * aceite qualquer das grafias; `configuracao.nomenclatura` decide qual é
 * preenchida, e exactamente uma o é.
 */
export interface SoftwareInfo {
  softwareInfoDetails?: SoftwareInfoDetalhes
  softwareInfoDetail?: SoftwareInfoDetalhes
  /**
   * Assinatura do PRODUTOR do software sobre todos os campos de `softwareInfo`.
   * Declarada com "minlength"/"maxlength" ambos 256 — ver #C-03, porque nenhuma
   * assinatura RS256 cabe em 256 caracteres.
   */
  jwsSoftwareSignature: string
}

/**
 * O cabeçalho que todos os sete pedidos partilham.
 *
 * `submissionGUID` vs `submissionId` é a divergência #C-02: a tabela de
 * `registarFactura` (1.1.2) pede `submissionGUID`, um UUID; as tabelas dos
 * outros seis serviços pedem `submissionId`, no formato `xxxxx-99999999-9999`
 * ("fornecido pelo barramento") — mas os EXEMPLOS de todos os sete, incluindo os
 * desses seis, mostram `submissionGUID` com um UUID. Ambos opcionais no tipo,
 * exactamente um preenchido em execução.
 */
export interface EnvelopeComum {
  schemaVersion: string
  submissionGUID?: string
  submissionId?: string
  /** NIF do contribuinte emissor. "maxlength": 15. */
  taxRegistrationNumber: string
  /** ISO 8601, com `Z` ou com desvio (`-03:00`). */
  submissionTimeStamp: string
  softwareInfo: SoftwareInfo
  /**
   * Assinatura do CONTRIBUINTE sobre os campos próprios de cada serviço.
   *
   * Ausente da tabela 1.1.2 (`registarFactura`), que assina documento a
   * documento em `jwsDocumentSignature`; presente nas dos outros seis. O
   * exemplo de `solicitarSerie` chama-lhe `"signature"` em vez de
   * `"jwsSignature"` — ver #C-08.
   */
  jwsSignature?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1.1 registarFactura
 * ──────────────────────────────────────────────────────────────────────────── */

/** `referenceInfo` (1.1.2.7). Obrigatório em NC, para dizer a factura de origem. */
export interface ReferenceInfo {
  /** "minlength": 1, "maxlength": 60. */
  reference: string
  /** "maxlength": 60. */
  reason?: string | null
}

/** Um item do array `taxes` de uma linha (1.1.2.8). */
export interface Imposto {
  taxType: TipoImposto
  /** ISO 3166-1 alpha-2, ou `AO-CAB` para Cabinda. */
  taxCountryRegion: string
  /** Obrigatório para IVA; opcional para IS/IEC. Ver `impostos.ts`. */
  taxCode?: string | null
  /**
   * Valor tributável unitário, quando o montante da linha é SÓ imposto e a base
   * subjacente não é receita do sujeito passivo. Exclusivo com
   * `debitAmount`/`creditAmount` da linha (E19).
   */
  taxBase?: number | null
  /** Percentagem: `14` = 14%. `0` em isenção ou não sujeição. */
  taxPercentage?: number | null
  /** Valor FIXO da verba de IS; multiplica-se pela `quantity` da linha. */
  taxAmount?: number | null
  /** Imposto calculado desta linha de impostos. */
  taxContribution?: number | null
}

/** Um item do array `lines` (1.1.2.6). */
export interface Linha {
  /** Começa em 1 e incrementa de 1 — sem saltos nem repetições (E12). */
  lineNumber: number
  /** "minlength": 1, "maxlength": 60. */
  productCode: string
  /** "minlength": 1, "maxlength": 200. */
  productDescription: string
  quantity: number
  /** "minlength": 1, "maxlength": 20. */
  unitOfMeasure: string
  /** Preço unitário sem descontos e sem impostos. */
  unitPrice: number
  /** Preço unitário já deduzido de descontos, sem impostos. Base do E21. */
  unitPriceBase: number
  referenceInfo?: ReferenceInfo | null
  /** Só um de `debitAmount`/`creditAmount` pode estar preenchido. */
  debitAmount?: number | null
  creditAmount?: number | null
  taxes?: Imposto[] | null
  /** Código do anexo 2.4. Obrigatório quando alguma linha de imposto tem `taxType = NS`. */
  taxExemptionCode?: string | null
  /** Total de descontos da linha, incluindo a parte proporcional do desconto global. */
  settlementAmount: number
}

/** `sourceDocumentID` (1.1.2.11). */
export interface SourceDocumentID {
  /** Número do documento regularizado. "minlength": 1, "maxlength": 60. */
  OriginatingON: string
  /** Data de emissão do documento regularizado, `YYYY-MM-DD`. */
  documentDate: string
}

/** Um item de `sourceDocuments` (1.1.2.10). */
export interface SourceDocument {
  lineNo: number
  sourceDocumentID: SourceDocumentID
  debitAmount?: number | null
  creditAmount?: number | null
}

/**
 * `paymentReceipt` (1.1.2.9). Obrigatório em AR/RC/RG, proibido nos restantes.
 *
 * A tabela 1.1.2.9 chama à propriedade `sourceDocuments`; o título da 1.1.2.10
 * chama-lhe `sourceDocumentList`. Ver #C-09 — as duas grafias são aceites na
 * leitura, emite-se a da tabela 1.1.2.9.
 */
export interface PaymentReceipt {
  sourceDocuments: SourceDocument[]
}

/** `currency` (1.1.2.13). Só quando a divisa não é AOA. */
export interface Currency {
  /** ISO 4217, excluindo AOA. */
  currencyCode: string
  /** Valor total na moeda estrangeira. Estritamente > 0. */
  currencyAmount: number
  /** Taxa de câmbio para AOA. Estritamente > 0. */
  exchangeRate: number
}

/** `documentTotals` (1.1.2.12). */
export interface DocumentTotals {
  /** Soma do imposto das linhas. */
  taxPayable: number
  /** Total sem imposto. */
  netTotal: number
  /** `netTotal + taxPayable`. */
  grossTotal: number
  currency?: Currency | null
}

/** Um item de `withholdingTaxList` (1.1.2.14). */
export interface WithholdingTax {
  withholdingTaxType: TipoRetencao
  /** "maxLength": 120. Disposição legal ou percentagem aplicável. */
  withholdingTaxDescription?: string | null
  withholdingTaxAmount: number
}

/** `document` (1.1.2.4) — uma factura. */
export interface Documento {
  /**
   * Identificação única, gerada em conformidade com o SAF-T(AO): código interno,
   * espaço, série, `/`, sequencial. Ex.: `FT AB2025/1`.
   * "minlength": 8, "maxlength": 60.
   */
  documentNo: string
  documentStatus: EstadoDocumento
  /** Obrigatório se e só se `documentStatus === 'A'`. */
  documentCancelReason?: MotivoAnulacao | null
  /** Assinatura do EMISSOR sobre 8 campos deste documento — ver `assinatura/jws.ts`. */
  jwsDocumentSignature: string
  /** `YYYY-MM-DD`. */
  documentDate: string
  documentType: TipoDocumento
  /** Código de actividade económica (anexo 2.1). "minlength"/"maxlength": 5. */
  eacCode?: string | null
  /** Momento da assinatura, ISO 8601 `YYYY-MM-DDThh:mm:ss`. */
  systemEntryDate: string
  /** ISO 3166-1 alpha-2. `AO` para compradores domésticos. */
  customerCountry: string
  /** NIF do cliente. `999999999` para consumidor final não identificado. */
  customerTaxID: string
  /** "minlength": 1, "maxlength": 200. */
  companyName: string
  lines?: Linha[] | null
  paymentReceipt?: PaymentReceipt | null
  documentTotals: DocumentTotals
  withholdingTaxList?: WithholdingTax[] | null
}

/**
 * Corpo de `POST registarFactura`.
 *
 * `documents` é declarado na tabela como "array com a lista de facturas
 * (object document)" e a composição 1.1.2.3 mostra `{ "document": {...} }`
 * envolvido — enquanto o exemplo mostra `"documents": [ "document": {...} ]`,
 * que nem sequer é JSON válido. Emitimos o array liso de `Documento`, que é a
 * única leitura que produz JSON válido, e registamos em #C-10.
 */
export interface PedidoRegistarFactura extends EnvelopeComum {
  /** Tem de ser igual a `documents.length` (E04). Máximo previsto: 30. */
  numberOfEntries: number
  documents: Documento[]
}

/** Item de `errorList` na resposta 400 de `registarFactura` (1.1.3.1). */
export interface ErroDeEntrada {
  idError: string
  descriptionError: string
  /** Obrigatório se o erro ocorreu num dos parâmetros do array `documents`. */
  documentNo?: string | null
}

/** Resposta 200 de `registarFactura` (1.1.3). `requestID`: "maxlength": 15. */
export interface RespostaRegistarFactura {
  requestID: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1.2 obterEstado
 * ──────────────────────────────────────────────────────────────────────────── */

/** `errorEntry` / item de `errorList` nas respostas (1.2.3.3). */
export interface ErroDeResposta {
  errorCode: string
  errorDescription: string
}

export interface PedidoObterEstado extends EnvelopeComum {
  requestID: string
}

/** Item de `documentStatusList` (1.2.3.2). */
export interface EstadoDeDocumento {
  documentNo: string
  /** `V` ou `I` — NÃO é o mesmo conjunto do `documentStatus` de entrada. */
  documentStatus: VeredictoDocumento
  /** Obrigatório quando `documentStatus === 'I'`. */
  errorList?: ErroDeResposta[] | null
}

/** `statusResult` (1.2.3.1). */
export interface StatusResult {
  requestID: string
  resultCode: ResultadoProcessamento
  /** Obrigatório quando `resultCode` não é 7, 8 nem 9. */
  documentStatusList?: EstadoDeDocumento[] | null
}

export interface RespostaObterEstado {
  statusResult: StatusResult
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1.3 listarFacturas
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PedidoListarFacturas extends EnvelopeComum {
  /** `YYYY-MM-DD`. */
  queryStartDate: string
  /** `YYYY-MM-DD`. */
  queryEndDate: string
}

/** Item de `documentResultList` (1.3.3.2). */
export interface FacturaListada {
  documentNo: string
  documentDate: string
}

/**
 * `documentListResult` (1.3.3.1).
 *
 * O exemplo da secção 1.3.1 chama a este objecto `statusFEListResult` e às suas
 * propriedades `documentResultCount` e `resultEntryList` (com itens
 * `documentEntryResult`). A tabela normativa diz `documentListResult`,
 * `documentResultCount` e `documentResultList`. Ver #C-11 — a leitura aceita as
 * duas.
 */
export interface DocumentListResult {
  documentResultCount: number
  documentResultList: FacturaListada[]
}

export interface RespostaListarFacturas {
  documentListResult: DocumentListResult
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1.4 consultarFactura
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PedidoConsultarFactura extends EnvelopeComum {
  documentNo: string
}

/**
 * `statusFEResult` (1.4.3.1).
 *
 * `documents` é um array porque "poderão ser encontrados mais que um resultado
 * se a factura foi anulada após emitida" — a consulta devolve o histórico, não
 * o estado actual. Quem quiser "o estado de hoje" tem de escolher, e a escolha
 * é do chamador: o documento não define ordenação.
 *
 * O exemplo mostra ainda um campo `hash` dentro de `document` que não consta de
 * nenhuma tabela de composição. Ver #C-12.
 */
export interface StatusFEResult {
  documentNo: string
  documents: Array<Documento & { hash?: string | null }>
}

export interface RespostaConsultarFactura {
  statusFEResult: StatusFEResult
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1.5 solicitarSerie
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PedidoSolicitarSerie extends EnvelopeComum {
  /** Alfanumérico contendo o ano com 2 ou 4 dígitos. "minlength": 3, "maxlength": 60. */
  seriesCode: string
  seriesYear: number
  documentType: TipoDocumento
  /** Normalmente 1. "minimum": 1. */
  firstDocumentNumber: number
}

/** Resposta 200 (1.5.3). `1` = sucesso, `0` = insucesso. */
export interface RespostaSolicitarSerie {
  resultCode: number
}

/** Item de `errorList` na resposta 400 de `solicitarSerie` (1.5.3.1). */
export type ErroDeSerie = Pick<ErroDeEntrada, 'idError' | 'descriptionError'>

/* ────────────────────────────────────────────────────────────────────────────
 * 1.6 listarSeries
 * ──────────────────────────────────────────────────────────────────────────── */

/** Todos os filtros são opcionais (1.6.2). */
export interface PedidoListarSeries extends EnvelopeComum {
  seriesCode?: string | null
  seriesYear?: number | null
  documentType?: TipoDocumento | null
  seriesStatus?: EstadoSerie | null
}

/** Item de `seriesInfo` (1.6.3.2). */
export interface SerieInfo {
  seriesCode?: string | null
  seriesYear?: number | null
  documentType?: TipoDocumento | null
  seriesStatus?: EstadoSerie | null
  /** Obrigatório. `YYYY-MM-DD`. */
  seriesCreationDate: string
  /** Obrigatório. Primeiro documento criado na série. */
  firstDocumentCreated: string
  /** Só existe depois de a série ter sido usada. */
  lastDocumentCreated?: string | null
  /** Obrigatório. */
  invoicingMethod: MetodoFacturacao
}

/** `seriesListResult` (1.6.3.1). */
export interface SeriesListResult {
  seriesResultCount: number
  seriesInfo: SerieInfo[]
}

export interface RespostaListarSeries {
  seriesListResult: SeriesListResult
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1.7 confirmarRejeitarDocumento
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PedidoConfirmarRejeitar extends EnvelopeComum {
  documentNo: string
  action: AccaoAdquirente
}

/**
 * `confirmRejectResult` (1.7.3.1).
 *
 * A tabela de saída 1.7.3 diz que o 200 devolve `statusFEResult`; a composição
 * seguinte define `confirmRejectResult`; e o exemplo devolve um `statusFEResult`
 * com um `actionIntended` e um `statusResult` aninhado, campos que não constam
 * de tabela nenhuma. Seguimos a composição — é a única das três que descreve os
 * campos que a operação precisa de devolver. Ver #C-13.
 */
export interface ConfirmRejectResult {
  actionResultCode: ResultadoAccao
  /** Obrigatório quando o código é `C_NOK` ou `R_NOK`. */
  errorList?: ErroDeResposta[] | null
}

export interface RespostaConfirmarRejeitar {
  confirmRejectResult: ConfirmRejectResult
}
