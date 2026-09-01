/**
 * Tipos de documento de facturação electrónica (campo `documentType`).
 *
 * Fonte: Blueprint do Serviço de Facturação Electrónica v1.5 (AGT 4.0 / SIGT),
 * secções 1.1.2.4 (object document) e 1.5.2 (solicitarSerie).
 *
 * ── Uma divergência do próprio documento ──────────────────────────────────────
 *
 * A secção 1.1.2.4 escreve `RG - Recibo`; a 1.5.2 e a 1.6.3.2 escrevem
 * `RG - Outros Recibos Emitidos`. É o mesmo código com duas designações. Ficamos
 * com a das secções 1.5/1.6 por serem duas contra uma, e porque é a designação
 * que distingue RG de RC — mas isto é texto de apresentação, não muda um byte do
 * que sai na chamada. Ver `DIVERGENCIAS.md`.
 */
export const TIPOS_DOCUMENTO = {
  FA: 'Factura de Adiantamento',
  FT: 'Factura',
  FR: 'Factura/Recibo',
  FG: 'Factura Global',
  AC: 'Aviso de Cobrança',
  AR: 'Aviso de Cobrança/Recibo',
  TV: 'Talão de Venda',
  RC: 'Recibo Emitido',
  RG: 'Outros Recibos Emitidos',
  RE: 'Estorno ou Recibo de Estorno',
  ND: 'Nota de Débito',
  NC: 'Nota de Crédito',
  AF: 'Factura/Recibo de Autofacturação',
  RP: 'Prémio ou Recibo de Prémio',
  RA: 'Resseguro Aceite',
  CS: 'Imputação a Co-seguradoras',
  LD: 'Imputação a Co-seguradora Líder',
} as const

export type TipoDocumento = keyof typeof TIPOS_DOCUMENTO

export const TIPOS_DOCUMENTO_VALIDOS = Object.keys(TIPOS_DOCUMENTO) as TipoDocumento[]

export function eTipoDocumento(valor: unknown): valor is TipoDocumento {
  return typeof valor === 'string' && valor in TIPOS_DOCUMENTO
}

/**
 * Os três tipos que são RECIBOS puros.
 *
 * A distinção não é cosmética — é a única coisa que decide, para um documento,
 * se `lines` ou `paymentReceipt` é o campo obrigatório e se o outro é proibido
 * (secção 1.1.2.4). Enviar `lines` num RC devolve E26; enviar `paymentReceipt`
 * numa FT devolve E27.
 *
 * Reparar que `AR` está aqui e `AC` não: `AC - Aviso de Cobrança` leva linhas,
 * `AR - Aviso de Cobrança/Recibo` leva recibo. Um caracter de diferença no
 * código, campos obrigatórios opostos.
 */
export const TIPOS_SO_COM_RECIBO = ['AR', 'RC', 'RG'] as const satisfies readonly TipoDocumento[]

export function exigeRecibo(tipo: TipoDocumento): boolean {
  return (TIPOS_SO_COM_RECIBO as readonly string[]).includes(tipo)
}

export function exigeLinhas(tipo: TipoDocumento): boolean {
  return !exigeRecibo(tipo)
}

/**
 * Nota de crédito. Único tipo em que a soma dos créditos das linhas tem de ser
 * INFERIOR à dos débitos (E16); em todos os outros tem de ser superior (E17).
 */
export function eNotaDeCredito(tipo: TipoDocumento): boolean {
  return tipo === 'NC'
}
