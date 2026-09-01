/**
 * Os tipos de documento que este sistema emite — a tabela única.
 *
 * ── Porque é que esta tabela existe, e existe AQUI ────────────────────────────
 *
 * Antes desta passagem a informação estava em três sítios que tinham de
 * concordar sem nada os obrigar a isso: o `enum` da migração de `factura`, o
 * `FacturaTipo` do model, e o `TIPO_INTERNO_PARA_AGT` privado do
 * `minfin-integration/mapeamento/factura_para_documento.ts`. Acrescentar um tipo
 * exigia lembrar-se dos três; esquecer o terceiro dava um documento emitido
 * localmente que a comunicação à AGT recusava com «tipo sem correspondência» —
 * e só no fim do dia, na varredura.
 *
 * Passa a haver uma tabela. O `enum`, o tipo TypeScript, o validator e o
 * mapeamento derivam todos dela.
 *
 * ── O que cada campo decide ───────────────────────────────────────────────────
 *
 * `designacao` é a que se IMPRIME. É o que a lei manda constar do documento e é
 * a única coisa aqui que um cliente vai ler: um documento tem de dizer o que é,
 * por extenso, em português, no topo. Não se abrevia para caber, não se traduz e
 * não se reaproveita a chave interna (que é aproximada, não literal).
 *
 * `codigo` é o `documentType` da AGT (Blueprint v1.5, 1.1.2.4). Entra na
 * referência do documento — `FT FT2026/1` — e portanto também é visível no
 * impresso, mas como identificador e não como designação.
 *
 * O resto são os invariantes que distinguem os tipos uns dos outros e que o
 * validator impõe. Estão aqui, ao lado da designação, porque são a mesma decisão:
 * o que este documento É determina o que ele tem de trazer.
 */

import { TIPOS_DOCUMENTO } from '../../minfin-integration/dominio/tipos_documento.js'

/** A que família do Decreto Presidencial 71/25 pertence o documento. */
export type CategoriaDocumento = 'factura' | 'documento_equivalente'

export interface DefinicaoDeTipo {
  /** `documentType` da AGT. Dois caracteres. */
  codigo: keyof typeof TIPOS_DOCUMENTO

  /** O que se imprime no topo do documento, e o que a API devolve para o ecrã. */
  designacao: string

  /**
   * `factura` para os do art.º 3.º (que titulam a operação); `documento_equivalente`
   * para os «demais documentos fiscalmente relevantes» do art.º 4.º.
   *
   * Não é decoração: a numeração é sequencial POR TIPO, e é esta coluna que
   * explica a quem lê um mapa de séries porque é que há tantas.
   */
  categoria: CategoriaDocumento

  /**
   * Leva linhas de artigos (`lines`) ou um recibo de pagamento (`paymentReceipt`)?
   *
   * O Blueprint torna um obrigatório e o outro proibido, consoante o tipo — mandar
   * linhas num `RC` devolve E26; mandar um recibo numa `FT` devolve E27.
   */
  eRecibo: boolean

  /** Exige a venda que lhe deu origem. Falso nos que nascem sem venda. */
  exigeVenda: boolean

  /**
   * Exige `documento_origem_id`.
   *
   * A nota de crédito é o caso que a AGT verifica (E13), mas a razão é a mesma nos
   * outros: um documento que rectifica ou liquida outro não se entende sozinho.
   */
  exigeOrigem: boolean

  /** Exige `periodo_inicio`/`periodo_fim` — só a factura global. */
  exigePeriodo: boolean

  /**
   * Exige a LISTA de vendas que cobre — plural, e é o que o distingue de
   * `exigeVenda`.
   *
   * A factura global titula todas as operações de um período (art.º 8.º), e
   * nenhuma delas é «a» venda do documento. As vendas cobertas ficam em
   * `factura_venda`, congeladas no momento da emissão.
   */
  exigeVendas: boolean
}

/**
 * A chave é o que fica GRAVADO em `factura.tipo`.
 *
 * São cadeias em português e não os códigos de dois caracteres da AGT por uma
 * razão só: as quatro primeiras já estão gravadas assim em produção, e trocar a
 * representação obrigaria a reescrever linhas de facturas emitidas. Um documento
 * fiscal emitido não se reescreve — nem sequer para arrumar um `enum`.
 */
export const TIPOS_DE_DOCUMENTO = {
  /* ── Facturas (art.º 3.º) ─────────────────────────────────────────────────── */

  'Factura': {
    codigo: 'FT',
    designacao: 'Factura',
    categoria: 'factura',
    eRecibo: false,
    exigeVenda: true,
    exigeOrigem: false,
    exigePeriodo: false,
    exigeVendas: false,
  },

  'Factura-Recibo': {
    codigo: 'FR',
    designacao: 'Factura-Recibo',
    categoria: 'factura',
    eRecibo: false,
    exigeVenda: true,
    exigeOrigem: false,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /**
   * A factura sem identificação do adquirente.
   *
   * A AGT não lhe dá código próprio — comunica-se como `FT`, com o
   * `customerTaxID` a `999999999`, que é o valor que o próprio Blueprint manda
   * usar «para contribuintes domésticos sem identificação do comprador».
   *
   * Mesmo assim é um tipo à parte AQUI, e não uma `Factura` com um campo vazio,
   * porque o decreto nomeia-a e o documento impresso tem de dizer o que é. Uma
   * factura genérica que se apresente como «Factura» está a omitir do papel
   * aquilo que a distingue.
   */
  'Factura Genérica': {
    codigo: 'FT',
    designacao: 'Factura Genérica',
    categoria: 'factura',
    eRecibo: false,
    exigeVenda: true,
    exigeOrigem: false,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /**
   * Várias operações do mesmo adquirente, num período. O art.º 8.º limita o
   * período a um mês e dá até ao quinto dia útil seguinte ao fim dele para
   * emitir — daí `exigePeriodo`, e daí não exigir venda: tem muitas, e nenhuma
   * delas é «a» venda.
   */
  'Factura Global': {
    codigo: 'FG',
    designacao: 'Factura Global',
    categoria: 'factura',
    eRecibo: false,
    exigeVenda: false,
    exigeOrigem: false,
    exigePeriodo: true,
    exigeVendas: true,
  },

  /**
   * Pagamento recebido antes de a operação se realizar. Não tem venda porque,
   * por definição, ainda não houve entrega nem prestação.
   */
  'Factura de Adiantamento': {
    codigo: 'FA',
    designacao: 'Factura de Adiantamento',
    categoria: 'factura',
    eRecibo: false,
    exigeVenda: false,
    exigeOrigem: false,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /**
   * Autofacturação: o ADQUIRENTE emite em nome do fornecedor.
   *
   * Leva numeração própria — o art.º 10.º exige-o expressamente, e é por isso que
   * é um tipo e não um sinalizador numa factura normal. Vai à AGT com
   * `documentStatus: 'S'` em vez de `'N'`.
   */
  'Autofacturação': {
    codigo: 'AF',
    designacao: 'Factura-Recibo de Autofacturação',
    categoria: 'factura',
    eRecibo: false,
    exigeVenda: false,
    exigeOrigem: false,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /* ── Documentos fiscalmente relevantes (art.º 4.º) ────────────────────────── */

  /**
   * Rectifica para MENOS um documento anterior. É o único tipo em que a soma dos
   * créditos das linhas tem de ser inferior à dos débitos (E16, contra E17 em
   * todos os outros) — e o único que a AGT recusa sem referência à origem (E13).
   */
  'Nota de Crédito': {
    codigo: 'NC',
    designacao: 'Nota de Crédito',
    categoria: 'documento_equivalente',
    eRecibo: false,
    exigeVenda: false,
    exigeOrigem: true,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /** Rectifica para MAIS um documento anterior. */
  'Nota de Débito': {
    codigo: 'ND',
    designacao: 'Nota de Débito',
    categoria: 'documento_equivalente',
    eRecibo: false,
    exigeVenda: false,
    exigeOrigem: true,
    exigePeriodo: false,
    exigeVendas: false,
  },

  'Talão de Venda': {
    codigo: 'TV',
    designacao: 'Talão de Venda',
    categoria: 'documento_equivalente',
    eRecibo: false,
    exigeVenda: true,
    exigeOrigem: false,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /**
   * `AC` leva LINHAS; `AR` leva RECIBO. Um caracter de diferença no código da
   * AGT, campos obrigatórios opostos — está assinalado nos mesmos termos em
   * `minfin-integration/dominio/tipos_documento.ts`, e é a confusão mais fácil de
   * fazer nesta tabela inteira.
   */
  'Aviso de Cobrança': {
    codigo: 'AC',
    designacao: 'Aviso de Cobrança',
    categoria: 'documento_equivalente',
    eRecibo: false,
    exigeVenda: false,
    exigeOrigem: true,
    exigePeriodo: false,
    exigeVendas: false,
  },

  'Aviso de Cobrança-Recibo': {
    codigo: 'AR',
    designacao: 'Aviso de Cobrança-Recibo',
    categoria: 'documento_equivalente',
    eRecibo: true,
    exigeVenda: false,
    exigeOrigem: true,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /** O recibo de uma factura. Liquida um documento que já existe. */
  'Recibo': {
    codigo: 'RC',
    designacao: 'Recibo',
    categoria: 'documento_equivalente',
    eRecibo: true,
    exigeVenda: false,
    exigeOrigem: true,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /**
   * Recibo que não liquida uma factura deste sistema — daí `exigeOrigem: false`,
   * a única diferença face a `Recibo`, e a razão de ser dos dois códigos.
   */
  'Outros Recibos': {
    codigo: 'RG',
    designacao: 'Recibo',
    categoria: 'documento_equivalente',
    eRecibo: true,
    exigeVenda: false,
    exigeOrigem: false,
    exigePeriodo: false,
    exigeVendas: false,
  },

  /** Devolução de um valor já recebido. */
  'Estorno': {
    codigo: 'RE',
    designacao: 'Recibo de Estorno',
    categoria: 'documento_equivalente',
    eRecibo: false,
    exigeVenda: false,
    exigeOrigem: true,
    exigePeriodo: false,
    exigeVendas: false,
  },
} as const satisfies Record<string, DefinicaoDeTipo>

export type FacturaTipo = keyof typeof TIPOS_DE_DOCUMENTO

/** Os valores admissíveis, na ordem em que aparecem acima. */
export const TIPOS_DE_DOCUMENTO_VALIDOS = Object.keys(TIPOS_DE_DOCUMENTO) as [
  FacturaTipo,
  ...FacturaTipo[],
]

export function eFacturaTipo(valor: unknown): valor is FacturaTipo {
  return typeof valor === 'string' && valor in TIPOS_DE_DOCUMENTO
}

/**
 * As listas que o validator consome, derivadas da tabela acima.
 *
 * Existem para que a obrigatoriedade de cada campo se imponha no VALIDATOR e não
 * na base de dados (regra 7.20): um `NOT NULL` recusaria a escrita com um erro do
 * motor que chega ao utilizador como 500 e não diz sequer que campo falta,
 * enquanto isto recusa com 400 e uma mensagem por campo, antes de a transacção
 * abrir. E são DERIVADAS — acrescentar um tipo à tabela actualiza o validator
 * sozinho, que é a única forma de os dois não divergirem.
 */
function tiposOnde(predicado: (definicao: DefinicaoDeTipo) => boolean): FacturaTipo[] {
  return TIPOS_DE_DOCUMENTO_VALIDOS.filter((tipo) => predicado(TIPOS_DE_DOCUMENTO[tipo]))
}

export const TIPOS_QUE_EXIGEM_VENDA = tiposOnde((d) => d.exigeVenda)
export const TIPOS_QUE_EXIGEM_ORIGEM = tiposOnde((d) => d.exigeOrigem)
export const TIPOS_QUE_EXIGEM_PERIODO = tiposOnde((d) => d.exigePeriodo)
export const TIPOS_QUE_EXIGEM_VENDAS = tiposOnde((d) => d.exigeVendas)
export const TIPOS_DE_RECIBO = tiposOnde((d) => d.eRecibo)

export function definicaoDe(tipo: FacturaTipo): DefinicaoDeTipo {
  return TIPOS_DE_DOCUMENTO[tipo]
}

/**
 * A designação a IMPRIMIR. Nunca a chave interna.
 *
 * `'Outros Recibos'` imprime-se «Recibo» e `'Autofacturação'` imprime-se
 * «Factura-Recibo de Autofacturação» — as chaves são nomes de gaveta, as
 * designações são o que a lei manda constar do documento.
 */
export function designacaoDe(tipo: FacturaTipo): string {
  return TIPOS_DE_DOCUMENTO[tipo].designacao
}

/**
 * O código de série por omissão para um tipo e um ano: `FT2026`, `NC2026`.
 *
 * Cumpre o que o Blueprint exige de um `seriesCode` — alfanumérico, mínimo 3
 * caracteres, contendo o ano — e cumpre o art.º 10.º por construção, porque leva
 * o código do tipo lá dentro: séries de tipos diferentes nunca coincidem, e
 * portanto nunca partilham contador.
 *
 * É só o valor por omissão. Quem quiser várias séries do mesmo tipo (um posto de
 * atendimento por série, por exemplo) passa a sua e esta função não é chamada.
 */
export function serieDefault(tipo: FacturaTipo, ano: number): string {
  return `${TIPOS_DE_DOCUMENTO[tipo].codigo}${ano}`
}

/**
 * A referência completa do documento, no formato do SAF-T(AO) que a AGT usa em
 * `documentNo` (1.1.2.4): código do tipo, espaço, série, `/`, sequencial.
 *
 *     FT FT2026/1        NC NC2026/14
 *
 * É esta cadeia — e não o `numero` sozinho — que identifica um documento. Dois
 * documentos da mesma empresa podem ter o número 14; só um é que é `NC NC2026/14`.
 * Por isso vai no impresso, na resposta da API e em qualquer sítio onde alguém
 * tenha de dizer «esta factura».
 */
export function referenciaDe(tipo: FacturaTipo, serie: string, numero: number): string {
  return `${TIPOS_DE_DOCUMENTO[tipo].codigo} ${serie}/${numero}`
}
