/**
 * De uma factura deste sistema para um `document` da AGT.
 *
 * ── A diferença que este ficheiro existe para resolver ────────────────────────
 *
 * Os preços deste sistema são **COM IVA INCLUÍDO**. Não é suposição: é o que
 * `relatorios_repository.ivaLiquidado()` faz, e está escrito lá — extrai o
 * imposto de um total que já o contém, com `iva = total × pct / (100 + pct)`.
 *
 * A AGT quer o contrário. `unitPrice` é "preço unitário, sem descontos e sem
 * impostos"; `unitPriceBase` é "já deduzido de descontos, sem incluir impostos";
 * `netTotal` é "o valor total do documento SEM imposto". Todos os montantes de
 * linha e de total do Blueprint são LÍQUIDOS, e o imposto vai à parte.
 *
 * Traduzir errado aqui não dá erro: dá uma factura comunicada com valores
 * plausíveis e 14% acima do que foi realmente cobrado.
 *
 * ── Os totais são derivados das linhas, e não copiados da factura ─────────────
 *
 * As regras E22, E23 e E24 exigem que os totais batam certo com a soma das
 * linhas — depois de arredondar. Copiar `factura.total` e arredondar as linhas à
 * parte dá diferenças de cêntimos que a AGT recusa.
 *
 * Por isso os totais são SOMADOS a partir das linhas já arredondadas, e a
 * diferença face ao total interno é reportada como AVISO. É a única ordem
 * possível: o documento comunicado tem de ser internamente consistente, e a
 * diferença tem de ser visível a alguém.
 */

import { DateTime } from 'luxon'
import Empresa from '#models/empresa'
import Factura from '#models/faturacao/factura'
import VendaItens from '#models/faturacao/venda_itens'
import Vendas from '#models/faturacao/vendas'
import { definicaoDe } from '../../app/helpers/tipos_de_documento.js'
import type { DocumentoParaRegisto } from '../cliente/cliente_agt.js'
import type { Imposto, Linha, SourceDocument } from '../contratos/contratos.js'
import { isencaoIvaValida } from '../dominio/isencoes_iva.js'
import type { EstadoDocumento, MotivoAnulacao } from '../dominio/estados.js'
import { exigeRecibo, type TipoDocumento } from '../dominio/tipos_documento.js'
import { arredondar, montantesIguais, somar } from '../validacao/formatos.js'

/**
 * `factura.tipo` → `documentType`.
 *
 * A correspondência já não vive aqui: vem de `app/helpers/tipos_de_documento.ts`,
 * que é a mesma tabela de onde saem o `enum` da migração, o tipo do model e as
 * regras do validator.
 *
 * Antes era um mapa privado com os quatro tipos que o sistema então emitia. O
 * problema não era estar incompleto — era ser um QUARTO sítio a ter de concordar
 * com os outros três, sem nada que o obrigasse. Acrescentar um tipo e esquecer
 * este ficheiro dava um documento emitido localmente que a comunicação recusava
 * com «tipo sem correspondência», e só na varredura do fim do dia.
 *
 * Os quatro tipos de seguros do Blueprint (`RP`, `RA`, `CS`, `LD`) continuam sem
 * correspondência, e é deliberado: não constam do Decreto Presidencial 71/25 e
 * não são documentos que este negócio emita.
 */

export interface OpcoesDeMapeamento {
  /**
   * Código da série registada na AGT. Entra no `documentNo`.
   *
   * Não é obrigatório: a série vive em `factura.serie`, escolhida no momento da
   * emissão, e é ESSA que tem de ser comunicada. Passar uma aqui comunicaria à AGT uma série diferente daquela em
   * que o documento foi de facto numerado — o que só serve para reconciliar um
   * histórico anterior à coluna, e por isso avisa quando diverge.
   */
  serie?: string

  /** Código de actividade económica (anexo 2.1). 5 caracteres. */
  eacCode?: string

  /**
   * Obrigatório quando a empresa NÃO está no regime de IVA.
   *
   * Sem regime, as linhas vão com `taxType: 'NS'` (não sujeito), e o Blueprint
   * torna `taxExemptionCode` obrigatório nesse caso (1.1.2.6). Qual dos códigos
   * do anexo 2.4 se aplica — `M00` (regime simplificado), `M02` (não sujeita),
   * `M04` (regime de exclusão) ou uma das isenções do artigo 12.º — é uma
   * afirmação legal sobre o negócio do contribuinte.
   *
   * Não tem valor por omissão de propósito: escolher um por ele poria uma
   * menção legal errada num documento fiscal.
   */
  codigoIsencao?: string

  /**
   * O documento de origem que está a ser corrigido ou liquidado (E13).
   *
   * Não é a fonte principal: a ligação vive em `factura.documento_origem_id` e é
   * daí que sai. Isto fica como recurso para o caso de a origem não ser um
   * documento deste sistema.
   */
  referenciaDeOrigem?: string

  /** Motivo da anulação, quando a factura está anulada. `I` ou `N`. */
  motivoAnulacao?: MotivoAnulacao

  /** `AO` por omissão. Só muda para clientes estrangeiros. */
  paisDoCliente?: string
}

export class MapeamentoImpossivel extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'MapeamentoImpossivel'
  }
}

export interface ResultadoDoMapeamento {
  documento: DocumentoParaRegisto
  /** Diferenças e aproximações que alguém tem de ver. Nunca vazias em silêncio. */
  avisos: string[]
}

/**
 * `documentNo` no formato do SAF-T(AO): código interno, espaço, série, `/`,
 * sequencial (1.1.2.4). Ex.: `FT FT12025/1`.
 *
 * "minlength": 8 — com uma série de 3 caracteres (o mínimo permitido) e um
 * número de um dígito, dá `FT ABC/1`, exactamente 8. A validação local apanha
 * qualquer combinação mais curta antes de sair.
 */
export function construirDocumentNo(tipo: TipoDocumento, serie: string, numero: number): string {
  return `${tipo} ${serie}/${numero}`
}

/**
 * A taxa de IVA em vigor para esta empresa, ou `null` se não estiver no regime.
 *
 * `Number()` explícito no percentual: o mysql2 devolve DECIMAL como string, e
 * `'14' * 1.5` funciona em JS mas `'14' + 1` dá `'141'` — numa fórmula de
 * imposto, isso é o género de erro que passa despercebido até alguém conferir.
 */
function taxaDaEmpresa(empresa: Empresa): number | null {
  if (!empresa.regime_iva || !empresa.taxaIva) return null

  const percentual = Number(empresa.taxaIva.percentual)
  return Number.isFinite(percentual) ? percentual : null
}

export async function facturaParaDocumento(
  facturaId: string,
  companyAlias: string,
  opcoes: OpcoesDeMapeamento
): Promise<ResultadoDoMapeamento> {
  const avisos: string[] = []

  const empresa = await Empresa.query()
    .where('company_alias', companyAlias)
    .preload('taxaIva')
    .firstOrFail()

  const factura = await Factura.query()
    .where('id', facturaId)
    .where('empresa_id', empresa.id)
    .firstOrFail()

  const definicao = definicaoDe(factura.tipo)

  if (!definicao) {
    throw new MapeamentoImpossivel(
      `O tipo de factura "${factura.tipo}" não consta da tabela de tipos de documento ` +
        '(app/helpers/tipos_de_documento.ts).'
    )
  }

  const documentType: TipoDocumento = definicao.codigo

  /*
   * A série: a que está gravada no documento, e não a que vier por parâmetro.
   *
   * O `documentNo` tem de identificar o documento tal como ele foi numerado. Se as
   * duas divergirem, comunica-se a gravada e avisa-se — comunicar a outra
   * inventaria um documento que não existe em livro nenhum.
   */
  const serie = factura.serie ?? opcoes.serie

  if (!serie) {
    throw new MapeamentoImpossivel(
      `A factura ${factura.numero} não tem série gravada e nenhuma foi indicada. ` +
        'Sem série não há `documentNo` possível — quem a atribui é factura_repository.emitir().'
    )
  }

  if (factura.serie && opcoes.serie && factura.serie !== opcoes.serie) {
    avisos.push(
      `A série indicada (${opcoes.serie}) difere da série em que o documento foi numerado ` +
        `(${factura.serie}). Comunica-se a segunda.`
    )
  }

  /*
   * O documento de origem.
   *
   * Sai de `factura.documento_origem_id`. O parâmetro `referenciaDeOrigem` fica
   * como recurso para origens que não sejam documentos deste sistema.
   */
  let origem: Factura | null = null

  if (factura.documento_origem_id) {
    origem = await Factura.query()
      .where('id', factura.documento_origem_id)
      .where('empresa_id', empresa.id)
      .first()
  }

  const referenciaDeOrigem =
    origem?.serie && origem.referencia ? origem.referencia : opcoes.referenciaDeOrigem

  if (definicao.exigeOrigem && !referenciaDeOrigem) {
    throw new MapeamentoImpossivel(
      `Um documento do tipo "${definicao.designacao}" tem de indicar o documento de origem. ` +
        'A AGT recusa-o com E13 sem essa referência.'
    )
  }

  const anulada = factura.status === 'anulada'

  /*
   * O motivo sai do próprio documento — `anular()` grava-o, e é lá que alguém o
   * sabe. O parâmetro fica como recurso para documentos anulados antes de a
   * coluna existir.
   */
  const motivoAnulacao = factura.motivo_anulacao ?? opcoes.motivoAnulacao

  if (anulada && !motivoAnulacao) {
    throw new MapeamentoImpossivel(
      'Esta factura está anulada e o motivo de anulação é obrigatório (I — incorrecta identificação do adquirente; ' +
        'N — documento não enviado ao adquirente), nos termos dos n.ºs 8 e 9 do art.º 8.º do Decreto Presidencial 71/25.'
    )
  }

  const percentual = taxaDaEmpresa(empresa)
  const semRegime = percentual === null

  if (semRegime && !opcoes.codigoIsencao) {
    throw new MapeamentoImpossivel(
      `A empresa "${empresa.nome}" não está no regime de IVA, e por isso as linhas vão como "não sujeito" (NS) — ` +
        'o que torna o código de motivo de isenção obrigatório. Indique `codigoIsencao` (anexo 2.4: M00 para o ' +
        'regime simplificado, M02 para não sujeita, M04 para o regime de exclusão, ou uma das isenções do artigo 12.º).'
    )
  }

  if (opcoes.codigoIsencao && !isencaoIvaValida(opcoes.codigoIsencao)) {
    throw new MapeamentoImpossivel(
      `O código de isenção "${opcoes.codigoIsencao}" não consta da tabela de isenções de IVA (anexo 2.4).`
    )
  }

  const percentualEfectivo = semRegime ? 0 : percentual!
  const factorIva = 1 + percentualEfectivo / 100
  const semImposto = (valorComIva: number) => valorComIva / factorIva

  /*
   * `documentStatus`: `A` anulado, `S` autofacturação, `N` o resto.
   *
   * A autofacturação é o adquirente a emitir em nome do fornecedor, e o Blueprint
   * dá-lhe um estado próprio em vez de um tipo próprio — o tipo (`AF`) diz o que o
   * documento é, o estado diz quem o emitiu. Comunicar `N` numa autofacturação
   * atribuiria a emissão a quem não a fez.
   *
   * A anulação ganha à autofacturação: uma `AF` anulada é, antes de tudo, anulada.
   */
  const documentStatus: EstadoDocumento = anulada ? 'A' : documentType === 'AF' ? 'S' : 'N'

  const identificacaoDoAdquirente = {
    customerCountry: opcoes.paisDoCliente ?? 'AO',
    // "Para documentos de facturação de contribuintes domésticos sem
    // identificação do comprador poderá ser utilizado o valor 999999999" (1.1.2.4).
    customerTaxID: factura.cliente_nif?.trim() || '999999999',
    companyName: (factura.cliente_nome?.trim() || 'Consumidor Final').slice(0, 200),
  }

  const cabecalho = {
    documentNo: construirDocumentNo(documentType, serie, factura.numero),
    documentStatus,
    ...(anulada ? { documentCancelReason: motivoAnulacao } : {}),
    documentDate: factura.data_emissao.toISODate()!,
    documentType,
    ...(opcoes.eacCode ? { eacCode: opcoes.eacCode } : {}),
    // "Timestamp de gravação do registo no momento da assinatura" (1.1.2.4) —
    // agora, e não a data de emissão: é o instante em que este documento é
    // preparado para ser assinado.
    systemEntryDate: DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    ...identificacaoDoAdquirente,
  }

  /* ── Os recibos saem por aqui, e nunca chegam às linhas ─────────────────────
   *
   * `AR`, `RC` e `RG` levam `paymentReceipt` e têm `lines` PROIBIDO (1.1.2.4):
   * mandar linhas num `RC` devolve E26. Um recibo não descreve artigos — descreve
   * que documentos é que regularizou.
   */
  if (exigeRecibo(documentType)) {
    if (!referenciaDeOrigem) {
      throw new MapeamentoImpossivel(
        `Um recibo do tipo "${definicao.designacao}" tem de dizer que documento regularizou, e ` +
          `este (${construirDocumentNo(documentType, serie, factura.numero)}) não tem documento ` +
          'de origem gravado nem nenhum foi indicado. O `paymentReceipt` da AGT não admite uma ' +
          'lista de origens vazia (1.1.2.9).'
      )
    }

    /*
     * Os totais de um recibo são o problema em aberto #RN-02: o Blueprint diz que
     * se apuram "somando os valores dos diferentes documentos origem regularizados
     * pelo recibo", e esses documentos estão no repositório da AGT.
     *
     * Aqui apura-se a partir do valor do PRÓPRIO recibo, que é o que este sistema
     * sabe com certeza. E22/E23 não são verificados em recibos (está em
     * `validacao/regras.ts`, pela mesma razão); E24 é, e satisfaz-se por
     * construção — `taxPayable` é a diferença e não uma segunda divisão.
     */
    const bruto = arredondar(Number(factura.total), 2)
    const netTotalRecibo = arredondar(semImposto(bruto), 2)
    const taxPayableRecibo = arredondar(bruto - netTotalRecibo, 2)

    const sourceDocuments: SourceDocument[] = [
      {
        lineNo: 1,
        sourceDocumentID: {
          OriginatingON: referenciaDeOrigem.slice(0, 60),
          documentDate: (origem?.data_emissao ?? factura.data_emissao).toISODate()!,
        },
        // #RN-01 continua em aberto (que sinal levam as linhas). Um recibo credita
        // o documento que liquida, que é a leitura que o próprio texto sugere ao
        // mandar contabilizar as NC "com sinal negativo".
        creditAmount: bruto,
      },
    ]

    avisos.push(
      `Os totais deste recibo foram apurados a partir do seu próprio valor e não da soma dos ` +
        `documentos de origem — ver #RN-02 em DIVERGENCIAS.md.`
    )

    return {
      documento: {
        ...cabecalho,
        paymentReceipt: { sourceDocuments },
        documentTotals: {
          taxPayable: taxPayableRecibo,
          netTotal: netTotalRecibo,
          grossTotal: arredondar(netTotalRecibo + taxPayableRecibo, 2),
        },
      },
      avisos,
    }
  }

  /*
   * Os itens da venda — quando há venda.
   *
   * Há documentos que nascem SEM venda: a factura global (tem várias, nenhuma
   * delas "a" venda), a de adiantamento (ainda não houve operação), e as notas de
   * crédito e de débito autónomas. Nenhum deles tem
   * itens em `venda_itens`, e todos precisam de `lines` — que a AGT exige em tudo
   * o que não seja recibo.
   */
  const itens = factura.venda_id
    ? await VendaItens.query()
        .where('venda_id', factura.venda_id)
        .whereNull('deleted_at')
        .preload('lote', (q) => q.preload('produto'))
        .orderBy('created_at', 'asc')
    : []

  if (factura.venda_id && itens.length === 0) {
    throw new MapeamentoImpossivel(
      `A venda ${factura.venda_id} não tem itens — não há linhas para comunicar.`
    )
  }

  /*
   * Desconto de cabeçalho, rateado pelas linhas.
   *
   * O Blueprint pede que `settlementAmount` "reflicta a proporção do desconto
   * global para essa linha e o desconto específico para a mesma" (1.1.2.6). Sem
   * o rateio, o desconto do cupão desaparecia do documento comunicado e o total
   * deixava de bater com o que o cliente pagou.
   *
   * `vendas.valor_desconto` é o desconto de cupão, aplicado ao total da venda —
   * não a nenhuma linha em particular. Reparte-se na proporção do valor de cada
   * linha, que é a única repartição que preserva a soma.
   */
  const venda = factura.venda_id
    ? await Vendas.query().where('id', factura.venda_id).whereNull('deleted_at').firstOrFail()
    : null

  const somaDosTotais = somar(
    itens.map((i) => Number(i.total)),
    2
  )
  const descontoGlobal = Math.max(0, Number(venda?.valor_desconto ?? 0))

  const linhasDosItens: Linha[] = itens.map((item, i) => {
    const quantidade = Number(item.quantidade)
    const precoUnitario = Number(item.preco_unitario)
    const totalDaLinha = Number(item.total)

    const brutoComIva = quantidade * precoUnitario
    const descontoDaLinha = Math.max(0, brutoComIva - totalDaLinha)

    const rateio = somaDosTotais > 0 ? (descontoGlobal * totalDaLinha) / somaDosTotais : 0

    const liquidoComIva = totalDaLinha - rateio

    /*
     * Ordem do cálculo: primeiro tira-se o IVA do preço unitário líquido, depois
     * multiplica-se pela quantidade — e o `creditAmount` é o produto ARREDONDADO
     * dos dois. Assim a regra E21 (`montante = quantity × unitPriceBase`) fica
     * satisfeita por construção, em vez de por sorte no arredondamento.
     */
    const unitPriceBase = arredondar(semImposto(liquidoComIva / quantidade), 2)
    const creditAmount = arredondar(quantidade * unitPriceBase, 2)

    const impostos: Imposto[] = semRegime
      ? [
          {
            taxType: 'NS',
            taxCountryRegion: 'AO',
            taxPercentage: 0,
            taxContribution: 0,
          },
        ]
      : [
          {
            taxType: 'IVA',
            taxCountryRegion: 'AO',
            taxCode: 'NOR',
            taxPercentage: percentual!,
            taxContribution: arredondar((creditAmount * percentual!) / 100, 2),
          },
        ]

    const produto = item.lote?.produto

    return {
      lineNumber: i + 1,
      // O número sequencial do produto é o código estável deste sistema; o id é
      // um UUID de 36 caracteres, que caberia nos 60 permitidos mas não diz nada
      // a quem lê a factura.
      productCode:
        produto?.numero !== undefined ? String(produto.numero) : item.lote_produto_id.slice(0, 60),
      productDescription: (produto?.nome ?? 'Artigo').slice(0, 200),
      quantity: quantidade,
      // `venda_itens` não guarda unidade de medida. `UN` é o valor neutro; se
      // vier a existir uma coluna, é aqui que ela entra.
      unitOfMeasure: 'UN',
      unitPrice: arredondar(semImposto(precoUnitario), 2),
      unitPriceBase,
      creditAmount,
      settlementAmount: arredondar(semImposto(descontoDaLinha + rateio), 2),
      taxes: impostos,
      ...(referenciaDeOrigem
        ? { referenceInfo: { reference: referenciaDeOrigem, reason: definicao.designacao } }
        : {}),
      ...(opcoes.codigoIsencao ? { taxExemptionCode: opcoes.codigoIsencao } : {}),
    }
  })

  /*
   * A linha única dos documentos que não têm itens.
   *
   * A factura global, a de adiantamento e as notas autónomas não têm nada em
   * `venda_itens` — e a AGT exige `lines` em tudo o que não seja recibo. A linha
   * descreve o documento pela sua própria designação, com o valor que ele tem.
   *
   * Não se inventam artigos. Uma factura de adiantamento não titula a entrega de
   * coisa nenhuma (é isso que a distingue), e uma factura global cobre operações
   * que já foram tituladas noutros documentos. Descrever a linha por aquilo que o
   * documento é diz a verdade; desdobrá-la em artigos plausíveis não diria.
   */
  function linhaDoProprioDocumento(): Linha {
    const brutoComIva = arredondar(Number(factura.total), 2)
    const creditAmount = arredondar(semImposto(brutoComIva), 2)

    return {
      lineNumber: 1,
      productCode: documentType,
      productDescription: definicao.designacao.slice(0, 200),
      quantity: 1,
      unitOfMeasure: 'UN',
      unitPrice: creditAmount,
      unitPriceBase: creditAmount,
      creditAmount,
      settlementAmount: 0,
      taxes: semRegime
        ? [{ taxType: 'NS', taxCountryRegion: 'AO', taxPercentage: 0, taxContribution: 0 }]
        : [
            {
              taxType: 'IVA',
              taxCountryRegion: 'AO',
              taxCode: 'NOR',
              taxPercentage: percentual!,
              taxContribution: arredondar((creditAmount * percentual!) / 100, 2),
            },
          ],
      ...(referenciaDeOrigem
        ? { referenceInfo: { reference: referenciaDeOrigem, reason: definicao.designacao } }
        : {}),
      ...(opcoes.codigoIsencao ? { taxExemptionCode: opcoes.codigoIsencao } : {}),
    }
  }

  const linhas: Linha[] =
    linhasDosItens.length > 0 ? linhasDosItens : [linhaDoProprioDocumento()]

  if (linhasDosItens.length === 0) {
    avisos.push(
      `Este documento não tem itens de venda: vai comunicado com uma linha única de ` +
        `${Number(factura.total).toFixed(2)} Kz, descrita como "${definicao.designacao}".`
    )
  }

  const netTotal = somar(
    linhas.map((l) => l.creditAmount),
    2
  )
  const taxPayable = somar(
    linhas.flatMap((l) => (l.taxes ?? []).map((t) => t.taxContribution)),
    2
  )
  const grossTotal = arredondar(netTotal + taxPayable, 2)

  /*
   * A conferência que não se pode saltar: o que vamos comunicar bate certo com o
   * que o cliente pagou?
   *
   * Uma diferença de cêntimos é normal (o IVA é extraído linha a linha e
   * arredondado); uma diferença maior significa que alguma coisa nesta tradução
   * não corresponde à realidade da venda — e é preferível comunicar com um aviso
   * gravado do que não comunicar, ou comunicar em silêncio.
   */
  const totalInterno = Number(factura.total)
  if (!montantesIguais(grossTotal, totalInterno, 2)) {
    avisos.push(
      `O total comunicado (${grossTotal.toFixed(2)} Kz) difere do total da factura ${factura.numero} ` +
        `(${totalInterno.toFixed(2)} Kz) em ${Math.abs(grossTotal - totalInterno).toFixed(2)} Kz. ` +
        'Os totais comunicados são somados a partir das linhas, como a AGT exige (E22–E24).'
    )
  }

  if (semRegime) {
    avisos.push(
      `A empresa não está no regime de IVA: as linhas vão como não sujeitas (NS) com o código de isenção ${opcoes.codigoIsencao}.`
    )
  }

  const documento: DocumentoParaRegisto = {
    ...cabecalho,
    lines: linhas,
    documentTotals: { taxPayable, netTotal, grossTotal },
  }

  return { documento, avisos }
}
