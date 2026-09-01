/**
 * Todos os conjuntos fechados de valores do Blueprint que não são impostos nem
 * tipos de documento.
 *
 * Cada um está aqui em vez de espalhado por literais nos validadores porque são
 * exactamente os valores que produzem `E03 - Valor não esperado do parâmetro`
 * quando saem errados, e essa é uma rejeição que não queremos descobrir do outro
 * lado da rede.
 */

/** `documentStatus` na ENTRADA — o estado que o emissor declara (1.1.2.4). */
export const ESTADOS_DOCUMENTO = {
  N: 'Normal',
  S: 'Autofacturação',
  A: 'Anulado',
  R: 'Documento de resumo de outros documentos criados noutras aplicações',
} as const
export type EstadoDocumento = keyof typeof ESTADOS_DOCUMENTO

/**
 * `documentCancelReason` (1.1.2.4) — nºs 8 e 9 do art.º 8.º do Decreto
 * Presidencial 71/25. Obrigatório quando, e só quando, `documentStatus = 'A'`.
 */
export const MOTIVOS_ANULACAO = {
  I: 'Anulada por incorrecta identificação do adquirente',
  N: 'Anulada por não ter sido enviado o documento ao adquirente',
} as const
export type MotivoAnulacao = keyof typeof MOTIVOS_ANULACAO

/**
 * `documentStatus` na SAÍDA de `obterEstado` (1.2.3.2) — o veredicto da AGT.
 *
 * ⚠️ Mesmo NOME de campo, conjunto de valores COMPLETAMENTE diferente do de
 * entrada acima. `A` significa "Anulado" quando o software o envia e não
 * significa nada quando a AGT o devolve; `V`/`I` só existem na resposta. Tratar
 * os dois como o mesmo tipo é o erro fácil de cometer aqui, e por isso são dois
 * tipos distintos.
 */
export const VEREDICTOS_DOCUMENTO = {
  V: 'Factura válida',
  I: 'Factura inválida',
} as const
export type VeredictoDocumento = keyof typeof VEREDICTOS_DOCUMENTO

/**
 * `resultCode` de `obterEstado` (1.2.3.1).
 *
 * A leitura importante não é o número — é se se pode desistir de perguntar.
 * 0, 1, 2 e 9 são finais; 7 e 8 pedem nova chamada mais tarde. Ver
 * `RESULTADO_E_FINAL`.
 */
export const RESULTADOS_PROCESSAMENTO = {
  0: 'Processamento concluído, sem facturas inválidas',
  1: 'Processamento concluído, com facturas válidas e facturas inválidas',
  2: 'Processamento concluído, sem facturas válidas',
  7: 'Solicitação não respondida por ser prematura ou repetitiva',
  8: 'Processamento ainda em curso',
  9: 'Processamento cancelado',
} as const
export type ResultadoProcessamento = keyof typeof RESULTADOS_PROCESSAMENTO

/** Códigos após os quais não vale a pena voltar a chamar `obterEstado`. */
export const RESULTADOS_FINAIS = [0, 1, 2, 9] as const

export function resultadoEFinal(codigo: number): boolean {
  return (RESULTADOS_FINAIS as readonly number[]).includes(codigo)
}

/**
 * `documentStatusList` é obrigatório na resposta quando `resultCode` não é
 * 7, 8 ou 9 (1.2.3.1). Serve para distinguir "a AGT ainda não respondeu" de
 * "a AGT respondeu e faltou-lhe a lista", que é um erro do lado deles.
 */
export function exigeListaDeDocumentos(codigo: number): boolean {
  return ![7, 8, 9].includes(codigo)
}

/** `seriesStatus` (1.6.2 e 1.6.3.2). */
export const ESTADOS_SERIE = {
  A: 'Série aberta',
  U: 'Série em utilização',
  F: 'Série fechada (após expirado o respectivo ano de emissão)',
} as const
export type EstadoSerie = keyof typeof ESTADOS_SERIE

/** `invoicingMethod` (1.6.3.2). */
export const METODOS_FACTURACAO = {
  FEPC: 'Facturação electrónica com emissão no Portal do Contribuinte',
  FESF: 'Facturação electrónica com emissão via Software de Facturação',
  SF: 'Facturação não electrónica com emissão via Software de Facturação',
} as const
export type MetodoFacturacao = keyof typeof METODOS_FACTURACAO

/** `action` de `confirmarRejeitarDocumento` (1.7.2). */
export const ACCOES_ADQUIRENTE = {
  C: 'Confirmação do documento',
  R: 'Rejeição do documento',
} as const
export type AccaoAdquirente = keyof typeof ACCOES_ADQUIRENTE

/** `actionResultCode` (1.7.3.1). */
export const RESULTADOS_ACCAO = {
  C_OK: 'Confirmação do documento com sucesso',
  R_OK: 'Rejeição do documento com sucesso',
  C_NOK: 'Confirmação do documento não possível',
  R_NOK: 'Rejeição do documento não possível',
} as const
export type ResultadoAccao = keyof typeof RESULTADOS_ACCAO

/** `errorList` é obrigatório quando a acção falhou (1.7.3.1). */
export function accaoFalhou(codigo: string): boolean {
  return codigo === 'C_NOK' || codigo === 'R_NOK'
}

/**
 * `resultCode` de `solicitarSerie` (1.5.3) — 1 = sucesso, 0 = insucesso.
 *
 * Sim, é o oposto da convenção de `obterEstado`, onde 0 é o melhor caso. Está
 * assim no documento; a `#RN-04` de `DIVERGENCIAS.md` regista-o para que
 * ninguém o "corrija" mais tarde por parecer um engano.
 */
export const SERIE_SUCESSO = 1
export const SERIE_INSUCESSO = 0
