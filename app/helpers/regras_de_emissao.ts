/**
 * O que pode ser emitido a seguir a quê.
 *
 * ── Porque é que isto existe ─────────────────────────────────────────────────
 *
 * A primeira versão da emissão validava que os campos existiam e que pertenciam à
 * empresa, e mais nada. Nunca perguntava se aquela venda já tinha sido facturada,
 * se aquele documento já estava pago, ou se o que se ia emitir fazia sentido a
 * seguir ao que já existia.
 *
 * O resultado, encontrado na base de desenvolvimento: **uma venda de 20.000 Kz com
 * OITO documentos fiscais a titulá-la** — cinco facturas, uma factura-recibo, uma
 * factura genérica e um talão de venda. Não é um incómodo de interface: é a mesma
 * operação declarada oito vezes às Finanças.
 *
 * Estas regras vivem aqui, e são impostas no REPOSITÓRIO — não no ecrã. Uma regra
 * de integridade que viva no controller é uma regra que o próximo caminho não
 * conhece (é a lição já escrita em `pos_repository.softDelete`, §7.21).
 */

import { type FacturaTipo, TIPOS_DE_DOCUMENTO, TIPOS_DE_DOCUMENTO_VALIDOS } from './tipos_de_documento.js'

/**
 * Os documentos que TITULAM a operação.
 *
 * O art.º 5.º obriga a titular cada transmissão de bens ou prestação de serviços
 * por uma factura ou documento equivalente — **uma**. Estes quatro são as formas
 * de o fazer, e são alternativas entre si, não cumulativas: quem emite uma
 * factura-recibo já titulou a venda e não emite mais nada por cima.
 *
 * A factura global também titula operações, e não está aqui: titula as de um
 * PERÍODO, não uma venda concreta, e por isso não colide com esta regra.
 */
export const TIPOS_QUE_TITULAM_A_VENDA = [
  'Factura',
  'Factura-Recibo',
  'Factura Genérica',
  'Talão de Venda',
] as const satisfies readonly FacturaTipo[]

export function titulaAVenda(tipo: FacturaTipo): boolean {
  return (TIPOS_QUE_TITULAM_A_VENDA as readonly string[]).includes(tipo)
}

/**
 * O documento já inclui o pagamento?
 *
 * Um recibo sobre um destes seria cobrar duas vezes no papel: a factura-recibo
 * titula a operação E o pagamento no mesmo acto, e o talão de venda é venda a
 * dinheiro ao balcão. O aviso de cobrança-recibo idem.
 */
export const TIPOS_JA_PAGOS = [
  'Factura-Recibo',
  'Talão de Venda',
  'Aviso de Cobrança-Recibo',
] as const satisfies readonly FacturaTipo[]

export function jaIncluiPagamento(tipo: FacturaTipo): boolean {
  return (TIPOS_JA_PAGOS as readonly string[]).includes(tipo)
}

/** Os que provam um recebimento sobre um documento anterior. */
export const TIPOS_QUE_LIQUIDAM = ['Recibo', 'Aviso de Cobrança-Recibo'] as const satisfies readonly FacturaTipo[]

export function liquida(tipo: FacturaTipo): boolean {
  return (TIPOS_QUE_LIQUIDAM as readonly string[]).includes(tipo)
}

/** Os que corrigem o valor de um documento anterior. */
export const TIPOS_QUE_RECTIFICAM = ['Nota de Crédito', 'Nota de Débito'] as const satisfies readonly FacturaTipo[]

export function rectifica(tipo: FacturaTipo): boolean {
  return (TIPOS_QUE_RECTIFICAM as readonly string[]).includes(tipo)
}

/** O que devolve dinheiro já recebido. */
export function eEstorno(tipo: FacturaTipo): boolean {
  return tipo === 'Estorno'
}

/**
 * O estado de um documento, do ponto de vista de quem decide o que fazer a seguir.
 *
 * É o mínimo que o repositório tem de saber, e é deliberadamente pequeno: quanto
 * mais campos entrarem aqui, mais difícil fica testar as regras sem base de dados.
 */
export interface EstadoDoDocumento {
  tipo: FacturaTipo
  anulado: boolean
  /** Já tem recibo (ou aviso-recibo) emitido sobre ele. */
  liquidado: boolean
  /** Tem algum documento a apontar-lhe — recibo, nota, aviso, estorno. */
  temDependentes: boolean
}

/**
 * Uma acção possível a partir de um documento.
 *
 * O `rotulo` é o que o utilizador lê e é a INTENÇÃO, não o nome do tipo: quem
 * está ao balcão quer «corrigir para menos», não «emitir uma nota de crédito».
 * O tipo vai a seguir, para quem já sabe o vocabulário.
 */
export interface AccaoPossivel {
  tipo: FacturaTipo
  rotulo: string
}

/**
 * O que se pode emitir a seguir a um documento — a espinha do fluxo.
 *
 * Devolve **lista vazia** para um documento anulado: um documento anulado não
 * produz efeitos, e portanto não há nada a liquidar nem a rectificar nele.
 */
export function proximosDocumentos(estado: EstadoDoDocumento): AccaoPossivel[] {
  if (estado.anulado) return []

  const accoes: AccaoPossivel[] = []
  const pago = jaIncluiPagamento(estado.tipo) || estado.liquidado

  /*
   * O recibo e o aviso de cobrança só fazem sentido enquanto há dívida. Sobre uma
   * factura-recibo ou um talão de venda nunca fazem — já foram pagos no acto —, e
   * sobre uma factura já liquidada seriam um segundo recibo do mesmo dinheiro.
   */
  /*
   * A factura global entra aqui como qualquer outra factura por pagar — titula um
   * período em vez de uma operação, mas é uma dívida na mesma e liquida-se com um
   * recibo. Ficou de fora na primeira versão, e a falha só apareceu ao exercitar o
   * fluxo por HTTP: uma global emitida oferecia só as duas notas, sem forma
   * nenhuma de registar o pagamento dela.
   */
  const facturasPorPagar: FacturaTipo[] = ['Factura', 'Factura Genérica', 'Factura Global']

  if (!pago && facturasPorPagar.includes(estado.tipo)) {
    accoes.push({ tipo: 'Recibo', rotulo: 'Registar o pagamento' })
    accoes.push({ tipo: 'Aviso de Cobrança', rotulo: 'Cobrar o que está em dívida' })
  }

  if (!pago && estado.tipo === 'Aviso de Cobrança') {
    accoes.push({ tipo: 'Recibo', rotulo: 'Registar o pagamento' })
  }

  /*
   * Rectificar vale sobre qualquer documento que titule ou cobre um valor —
   * incluindo os já pagos: descobrir um erro depois de receber é o caso normal, e
   * é para isso que a nota de crédito existe.
   */
  if (titulaAVenda(estado.tipo) || estado.tipo === 'Factura Global' || estado.tipo === 'Aviso de Cobrança') {
    accoes.push({ tipo: 'Nota de Crédito', rotulo: 'Corrigir para menos' })
    accoes.push({ tipo: 'Nota de Débito', rotulo: 'Corrigir para mais' })
  }

  /* Devolver dinheiro só se ele chegou a entrar. */
  if (pago) {
    accoes.push({ tipo: 'Estorno', rotulo: 'Devolver o dinheiro recebido' })
  }

  return accoes
}

/** Um documento com dependentes não se anula — ver `anular()` no repositório. */
export function podeSerAnulado(estado: EstadoDoDocumento): boolean {
  return !estado.anulado && !estado.temDependentes
}

/**
 * Os tipos que se emitem a partir de uma VENDA fechada, para o ecrã oferecer os
 * quatro e mais nenhum.
 */
export function tiposParaUmaVenda(): AccaoPossivel[] {
  return TIPOS_QUE_TITULAM_A_VENDA.map((tipo) => ({
    tipo,
    rotulo: TIPOS_DE_DOCUMENTO[tipo].designacao,
  }))
}

/**
 * Os tipos que NÃO nascem de uma venda nem de outro documento — os que um
 * utilizador pode emitir de raiz, sem contexto nenhum.
 *
 * Derivado, e não escrito à mão: um tipo novo entra aqui sozinho se não exigir
 * nem venda nem origem.
 */
export function tiposAvulsos(): AccaoPossivel[] {
  return TIPOS_DE_DOCUMENTO_VALIDOS.filter((tipo) => {
    const d = TIPOS_DE_DOCUMENTO[tipo]
    return !d.exigeVenda && !d.exigeOrigem
  }).map((tipo) => ({ tipo, rotulo: TIPOS_DE_DOCUMENTO[tipo].designacao }))
}
