/**
 * Sistemas de imposto, códigos de imposto e retenções na fonte.
 *
 * Fonte: secções 1.1.2.8 (array taxes) e 1.1.2.14 (array withholdingTaxList).
 */

/** `taxType` (1.1.2.8) — "minlength": 2, "maxlength": 3. */
export const TIPOS_IMPOSTO = {
  IVA: 'Imposto sobre o Valor Acrescentado',
  IS: 'Imposto de Selo',
  IEC: 'Imposto Especial de Consumo',
  NS: 'Não sujeito a IVA ou IS',
} as const
export type TipoImposto = keyof typeof TIPOS_IMPOSTO

/** `taxCode` quando `taxType = IVA` (1.1.2.8). Conjunto fechado. */
export const CODIGOS_IVA = {
  NOR: 'Taxa normal',
  INT: 'Taxa intermédia',
  RED: 'Taxa reduzida',
  ISE: 'Isento',
  OUT: 'Outra',
} as const
export type CodigoIva = keyof typeof CODIGOS_IVA

/**
 * `taxCode` fora do IVA NÃO é um conjunto fechado:
 *
 * - `IS`  → a verba do Imposto de Selo (anexo 2.3: "1", "7.1", "20.4.2", ...) ou `ISE`.
 * - `IEC` → o código pautal (anexo 2.2: "2202.10.00", "2208.30.00", ...) ou `ISE`.
 *
 * Os dois anexos são tabelas legais que mudam por diploma, e congelá-las aqui em
 * TypeScript garantia só uma coisa: que uma verba nova passava a ser recusada
 * pelo NOSSO validador antes sequer de chegar à AGT. Validamos a FORMA (2 a 10
 * caracteres, e `ISE` sempre aceite) e deixamos o valor à AGT, que é quem tem a
 * tabela verdadeira. Ver `DIVERGENCIAS.md` #RN-07.
 */
export const CODIGO_ISENTO = 'ISE'

export function codigoDeImpostoValido(
  tipo: TipoImposto,
  codigo: string | null | undefined
): boolean {
  if (tipo === 'NS') {
    // O documento não define `taxCode` para NS. Aceitamos ausente; se vier, tem
    // de respeitar a forma genérica.
    if (codigo === null || codigo === undefined || codigo === '') return true
    return codigo.length >= 2 && codigo.length <= 10
  }

  if (codigo === null || codigo === undefined || codigo === '') {
    // 1.1.2.8: "de preenchimento obrigatório dependendo do valor preenchido no
    // campo taxType". Para IVA é sempre exigido — os cinco valores cobrem todos
    // os casos, incluindo isenção. Para IS/IEC o próprio texto diz
    // "preenchido opcionalmente".
    return tipo !== 'IVA'
  }

  if (tipo === 'IVA') return codigo in CODIGOS_IVA

  return codigo === CODIGO_ISENTO || (codigo.length >= 2 && codigo.length <= 10)
}

/**
 * `taxCountryRegion` (1.1.2.8) — ISO 3166-1 alpha-2, mais um único valor que não
 * é um país: `AO-CAB`, a região de Cabinda. É por isso que o campo tem
 * "maxlength": 6 e não 2.
 */
export const REGIAO_CABINDA = 'AO-CAB'

export function regiaoDeImpostoValida(valor: string): boolean {
  if (valor === REGIAO_CABINDA) return true
  return /^[A-Z]{2}$/.test(valor)
}

/**
 * `withholdingTaxType` (1.1.2.14) — retenção na fonte / cativação.
 *
 * ⚠️ O documento declara "maxLength": 3 e depois lista `IRPC` e `IRPS`, que têm
 * 4 caracteres. Um dos dois está errado e não se sabe qual. Aceitamos os nove
 * valores da lista (a lista é mais específica que o atributo) e registamos a
 * divergência — se a AGT validar pelo comprimento, `IRPC`/`IRPS` devolvem E03 e
 * é preciso perguntar-lhes qual vale. Ver `DIVERGENCIAS.md` #C-06.
 */
export const TIPOS_RETENCAO = {
  IRT: 'Imposto sobre os Rendimentos do Trabalho',
  II: 'Imposto Industrial',
  IS: 'Imposto de Selo',
  IVA: 'Imposto sobre o Valor Acrescentado',
  IP: 'Imposto Predial',
  IAC: 'Imposto sobre Aplicação de Capitais',
  OU: 'Outros',
  IRPC: 'Imposto sobre o rendimento de pessoas colectivas (impostos futuros)',
  IRPS: 'Imposto sobre o rendimento de pessoas singulares (impostos futuros)',
} as const
export type TipoRetencao = keyof typeof TIPOS_RETENCAO

/** Os que excedem o "maxLength": 3 declarado — ver aviso acima. */
export const RETENCOES_ACIMA_DO_LIMITE_DECLARADO: TipoRetencao[] = ['IRPC', 'IRPS']
