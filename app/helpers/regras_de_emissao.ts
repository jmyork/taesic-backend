/**
 * O que pode ser emitido a seguir a quê, e o que a VENDA emite por si.
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
 *
 * ── O que mudou nesta passagem ───────────────────────────────────────────────
 *
 * Duas coisas, e a segunda é a maior.
 *
 * A primeira: `Talão de Venda` e `Aviso de Cobrança-Recibo` deixaram de existir.
 * O talão era uma quarta forma de titular a mesma venda, a competir com as outras
 * três sem nada que o distinguisse no fluxo; o aviso-recibo era um recibo com
 * outro nome, e o recibo já se emite quando o pagamento entra.
 *
 * Basta terem saído de `TIPOS_DE_DOCUMENTO` para saírem do `enum` da coluna: a
 * migração de `factura` deriva o `enum` desta tabela e nunca de uma lista escrita
 * lá. Não há migração de remoção porque não é preciso nenhuma.
 *
 * A segunda: **o documento deixou de ser uma escolha e passou a ser uma
 * consequência.** Quem está ao balcão não escolhe entre «Factura» e
 * «Factura-Recibo» — escolhe se recebe agora, se recebe depois, ou se está a
 * receber por algo que ainda não entregou. O tipo sai daí, em `documentoDaVenda()`,
 * e é a mesma função que o fecho da venda usa e que o ecrã pode usar para
 * ANTECIPAR o que vai sair. Um ecrã que adivinhe por sua conta acaba por discordar
 * do que é emitido, e o utilizador descobre isso depois de o documento existir.
 */

import {
  type FacturaTipo,
  TIPOS_DE_DOCUMENTO,
  TIPOS_DE_DOCUMENTO_VALIDOS,
} from './tipos_de_documento.js'

/**
 * Os documentos que TITULAM a operação.
 *
 * O art.º 5.º obriga a titular cada transmissão de bens ou prestação de serviços
 * por uma factura ou documento equivalente — **uma**. Estes três são as formas
 * de o fazer, e são alternativas entre si, não cumulativas: quem emite uma
 * factura-recibo já titulou a venda e não emite mais nada por cima.
 *
 * A factura global também titula operações, e não está aqui: titula as de um
 * PERÍODO, não uma venda concreta, e por isso não colide com esta regra.
 *
 * A factura de ADIANTAMENTO também não está, e a razão é a que lhe dá o nome:
 * titula um recebimento, não uma entrega. A venda que ela acompanha continua por
 * titular até o produto sair — é isso que `vendas_repository.entregar()` faz.
 */
export const TIPOS_QUE_TITULAM_A_VENDA = [
  'Factura',
  'Factura-Recibo',
  'Factura Genérica',
] as const satisfies readonly FacturaTipo[]

export function titulaAVenda(tipo: FacturaTipo): boolean {
  return (TIPOS_QUE_TITULAM_A_VENDA as readonly string[]).includes(tipo)
}

/**
 * O que prova um recebimento sobre um documento anterior.
 *
 * Ficou só o recibo. O `Aviso de Cobrança-Recibo` fazia exactamente o mesmo com
 * outro nome, e ter dois documentos para o mesmo acto obrigava quem cobra a
 * escolher entre eles sem nenhum critério que os separasse.
 */
export const TIPOS_QUE_LIQUIDAM = ['Recibo'] as const satisfies readonly FacturaTipo[]

export function liquida(tipo: FacturaTipo): boolean {
  return (TIPOS_QUE_LIQUIDAM as readonly string[]).includes(tipo)
}

/**
 * ── Porque é que a factura de ADIANTAMENTO não espera recibo ─────────────────
 *
 * Houve aqui, por uma passagem, uma lista `TIPOS_QUE_ESPERAM_RECIBO` com o
 * adiantamento lá dentro, e um `aguardaRecibo()` mais largo do que
 * `estaEmDivida()`. Está fora, e a razão é a definição da própria condição: no
 * adiantamento o dinheiro entra PRIMEIRO e a mercadoria sai depois
 * (`REGRAS_DA_CONDICAO.adiantamento.exigePagamento` é `true`). Não há recebimento
 * nenhum por confirmar — confirmá-lo seria pedir a quem já pagou que dissesse
 * outra vez que pagou.
 *
 * O que um adiantamento espera é a ENTREGA, e é isso que
 * `vendas_repository.entregar()` faz: tira o stock, reconhece a receita e emite o
 * documento final da operação.
 */

/** Os que corrigem o valor de um documento anterior. */
export const TIPOS_QUE_RECTIFICAM = ['Nota de Crédito', 'Nota de Débito'] as const satisfies readonly FacturaTipo[]

export function rectifica(tipo: FacturaTipo): boolean {
  return (TIPOS_QUE_RECTIFICAM as readonly string[]).includes(tipo)
}

/** O que devolve dinheiro já recebido. */
export function eEstorno(tipo: FacturaTipo): boolean {
  return tipo === 'Estorno'
}

/* ── A venda decide o documento ─────────────────────────────────────────────── */

/**
 * Como é que esta venda é paga. É o único campo que o balcão escolhe, e dele sai
 * tudo o resto — o documento, se o stock sai, e se o valor entra na receita.
 *
 * Vive em `vendas.condicao_pagamento`.
 */
export type CondicaoPagamento = 'pronto_pagamento' | 'credito' | 'adiantamento'

export const CONDICOES_DE_PAGAMENTO = [
  'pronto_pagamento',
  'credito',
  'adiantamento',
] as const satisfies readonly CondicaoPagamento[]

/**
 * O que cada condição implica, num sítio só.
 *
 * Está aqui e não espalhado por `close()` porque as quatro respostas têm de
 * concordar entre si: uma condição que exija pagamento no acto e ao mesmo tempo
 * produza um documento em dívida seria um documento a dizer o contrário do
 * dinheiro. Junto, isso vê-se; espalhado por quatro `if`, não.
 */
export interface RegraDaCondicao {
  /** Exige que a soma dos pagamentos bata certo com o total, no fecho. */
  exigePagamento: boolean

  /**
   * O stock sai no fecho da venda.
   *
   * Falso no adiantamento, e é o que o distingue de tudo o resto: recebeu-se o
   * dinheiro de algo que ainda não foi entregue. Dar baixa no armazém aqui seria
   * afirmar uma saída que não houve — e o produto continuaria fisicamente lá, com
   * o sistema a dizer que não.
   */
  saiStock: boolean

  /**
   * Exige um adquirente identificado por NIF.
   *
   * A crédito, porque não se cobra a quem não se identificou: uma dívida sem
   * devedor não é cobrável e o aviso de cobrança não teria a quem ser dirigido.
   * No adiantamento, porque há uma entrega por fazer e tem de se saber a quem.
   */
  exigeNif: boolean

  /**
   * O valor conta como receita reconhecida do período.
   *
   * Falso no adiantamento — e é a única entrada de dinheiro deste sistema que não
   * é receita. Recebeu-se por conta de uma entrega futura; o ganho reconhece-se na
   * entrega, não no recebimento. Ver `relatorios_repository.ts`.
   */
  eReceita: boolean
}

export const REGRAS_DA_CONDICAO: Record<CondicaoPagamento, RegraDaCondicao> = {
  pronto_pagamento: { exigePagamento: true, saiStock: true, exigeNif: false, eReceita: true },
  credito: { exigePagamento: false, saiStock: true, exigeNif: true, eReceita: true },
  adiantamento: { exigePagamento: true, saiStock: false, exigeNif: true, eReceita: false },
}

export function regraDa(condicao: CondicaoPagamento): RegraDaCondicao {
  return REGRAS_DA_CONDICAO[condicao]
}

/**
 * O stock desta venda chegou a sair do armazém?
 *
 * ── A pergunta que tudo o que mexe em stock tem de fazer ─────────────────────
 *
 * **O armazém tem de seguir o que aconteceu de facto**, e desde que existe o
 * adiantamento «venda fechada» deixou de significar «produto entregue». Uma venda
 * por adiantamento fecha com o dinheiro recebido e o produto ainda lá — a saída só
 * acontece em `entregar()`.
 *
 * Daí esta função, e daí estar aqui e não escrita à mão em cada sítio: quem
 * DEVOLVE stock tem de perguntar primeiro se ele saiu. Um reembolso de um
 * adiantamento por entregar que devolvesse unidades ao armazém estaria a criar
 * mercadoria do nada — o sistema passaria a contar mais unidades do que as que lá
 * estão, e o inventário deixaria de bater à primeira contagem física.
 *
 * É a mesma condição que `SQL_RECEITA_RECONHECIDA` (em `relatorios_repository.ts`)
 * exprime em SQL, e não é coincidência: o custo da mercadoria acompanha a saída
 * dela, portanto reconhecer receita e dar baixa no armazém são o mesmo momento.
 */
export function stockJaSaiu(venda: {
  condicao_pagamento?: CondicaoPagamento | null
  entregue_em?: unknown
}): boolean {
  const condicao = venda.condicao_pagamento ?? 'pronto_pagamento'
  return regraDa(condicao).saiStock || Boolean(venda.entregue_em)
}

/**
 * O documento que esta venda emite ao fechar.
 *
 * ── É uma função e não uma tabela por causa do NIF ──────────────────────────
 *
 * Duas das três condições determinam o tipo sozinhas. O pronto pagamento não:
 * depende de o comprador se ter identificado, e é essa a distinção que o decreto
 * faz entre a factura-recibo e a factura genérica. Sem NIF não há adquirente que
 * o documento possa nomear, e o Blueprint manda comunicar `999999999` — a
 * genérica é o documento desenhado para isso, e apresentá-la como «Factura» seria
 * omitir do papel aquilo que a distingue.
 *
 * `temNif` e não `temCliente`: um cliente registado sem NIF continua sem
 * identificação fiscal, e é a identificação fiscal que o documento precisa de
 * imprimir. Um cliente sem NIF numa venda pronta dá uma genérica — o nome dele
 * fica na venda, mas o documento diz o que a lei manda dizer.
 */
export function documentoDaVenda(venda: {
  condicao: CondicaoPagamento
  temNif: boolean
}): FacturaTipo {
  if (venda.condicao === 'adiantamento') return 'Factura de Adiantamento'
  if (venda.condicao === 'credito') return 'Factura'
  return venda.temNif ? 'Factura-Recibo' : 'Factura Genérica'
}

/* ── O que se pode fazer a seguir a um documento ─────────────────────────────── */

/**
 * O estado de um documento, do ponto de vista de quem decide o que fazer a seguir.
 *
 * É o mínimo que o repositório tem de saber, e é deliberadamente pequeno: quanto
 * mais campos entrarem aqui, mais difícil fica testar as regras sem base de dados.
 */
export interface EstadoDoDocumento {
  tipo: FacturaTipo
  anulado: boolean
  /**
   * Nasceu em dívida — tem `data_vencimento`.
   *
   * Substituiu a antiga lista `TIPOS_JA_PAGOS`, que respondia à mesma pergunta
   * pelo TIPO. Não dava: uma `Factura` emitida ao balcão e paga no acto e uma
   * `Factura` a 30 dias são o mesmo tipo, e a lista tinha de decidir por ambas.
   * Ler da linha responde certo nos dois casos.
   */
  aCredito: boolean
  /** Já tem recibo emitido sobre ele. */
  liquidado: boolean
  /** Tem algum documento a apontar-lhe — recibo, nota, aviso, estorno. */
  temDependentes: boolean
}

/**
 * Há dinheiro por receber neste documento?
 *
 * A regra inteira das contas a receber, numa linha, e é a MESMA que
 * `factura_repository.contasAReceber()` traduz para SQL. Se as duas divergirem, o
 * ecrã de detalhe oferece «registar pagamento» num documento que o mapa de
 * cobranças não mostra — ou o contrário.
 */
export function estaEmDivida(estado: EstadoDoDocumento): boolean {
  return !estado.anulado && estado.aCredito && !estado.liquidado
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

  /*
   * O recibo e o aviso de cobrança só fazem sentido enquanto há dívida — e a
   * dívida lê-se agora da data de vencimento, não do tipo.
   *
   * Consequência a reparar: uma factura-recibo, uma genérica e um adiantamento
   * nunca chegam aqui, porque nascem sem vencimento. Antes eram excluídos por uma
   * lista de tipos escrita à mão, que tinha de ser mantida em sintonia com a
   * tabela de tipos e não estava.
   */
  if (estaEmDivida(estado)) {
    accoes.push({ tipo: 'Recibo', rotulo: 'Registar o pagamento' })
    accoes.push({ tipo: 'Aviso de Cobrança', rotulo: 'Cobrar o que está em dívida' })
  }

  /*
   * Rectificar vale sobre qualquer documento que titule ou cobre um valor —
   * incluindo os já pagos: descobrir um erro depois de receber é o caso normal, e
   * é para isso que a nota de crédito existe.
   */
  if (
    titulaAVenda(estado.tipo) ||
    estado.tipo === 'Factura Global' ||
    estado.tipo === 'Factura de Adiantamento' ||
    estado.tipo === 'Aviso de Cobrança'
  ) {
    accoes.push({ tipo: 'Nota de Crédito', rotulo: 'Corrigir para menos' })
    accoes.push({ tipo: 'Nota de Débito', rotulo: 'Corrigir para mais' })
  }

  /* Devolver dinheiro só se ele chegou a entrar. */
  if (!estado.aCredito || estado.liquidado) {
    accoes.push({ tipo: 'Estorno', rotulo: 'Devolver o dinheiro recebido' })
  }

  return accoes
}

/** Um documento com dependentes não se anula — ver `anular()` no repositório. */
export function podeSerAnulado(estado: EstadoDoDocumento): boolean {
  /*
   * Ter dependentes deixou de impedir.
   *
   * Impedia, e o raciocínio era sólido: um recibo que liquida uma factura anulada
   * declara ter recebido por conta de nada. O que estava errado era a saída — a
   * recusa punha em cima de quem anula o trabalho de descobrir, por tentativa e
   * erro, quais eram os dependentes e por que ordem os desfazer.
   *
   * A garantia mantém-se, e agora é o sistema que a cumpre: `anular()` arrasta em
   * cadeia tudo o que depende do documento, de fora para dentro, na mesma
   * transacção. Nunca a origem — anular um recibo não anula a factura.
   *
   * `temDependentes` continua no estado porque descreve o documento e é lido por
   * quem mostra o ecrã; deixou é de decidir isto.
   */
  return !estado.anulado
}

/**
 * Os tipos que se emitem a partir de uma VENDA fechada, para o ecrã oferecer
 * esses e mais nenhum.
 *
 * Continua a existir para a emissão manual — a venda antiga que ficou por
 * titular, o documento que foi anulado e tem de ser refeito. No fluxo normal
 * ninguém escolhe daqui: `documentoDaVenda()` decide, e o fecho emite.
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
