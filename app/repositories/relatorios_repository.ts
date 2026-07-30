import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Empresa from '#models/empresa'
import { RelatoriosFilterDTO } from '#dtos/relatorios_dto'

/** Só vendas fechadas contam como receita real — mesma convenção de metricas_repository.ts. */
const STATUS_FATURADA = 'fechada'
const LIMIT_TOP_OMISSAO = 10

type Periodo = { inicio: Date; fim: Date }

export default class RelatoriosRepository {
  private resolvePeriodo(filtro: RelatoriosFilterDTO): Periodo {
    const inicio = filtro.data_inicio
      ? DateTime.fromJSDate(filtro.data_inicio).startOf('day')
      : DateTime.now().startOf('month')
    const fim = filtro.data_fim ? DateTime.fromJSDate(filtro.data_fim).endOf('day') : DateTime.now().endOf('day')
    return { inicio: inicio.toJSDate(), fim: fim.toJSDate() }
  }

  /**
   * Query base de vendas fechadas desta empresa, já com os joins até `empresa` e os
   * filtros comuns (pos/caixa/vendedor/cliente/estado) aplicados — reutilizada por todos
   * os relatórios cuja unidade é a venda. `incluirStatus`: por omissão só considera vendas
   * fechadas (receita real); alguns relatórios (ex.: descontos) também precisam disto, mas
   * outros (ex.: relatório de vendas em bruto) podem querer outros estados via `filtro.status`.
   */
  private baseVendas(filtro: RelatoriosFilterDTO, periodo?: Periodo) {
    let query = db
      .from('vendas')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)

    if (filtro.status) {
      query = query.where('vendas.status', filtro.status)
    } else {
      query = query.where('vendas.status', STATUS_FATURADA)
    }

    if (periodo) {
      query = query.whereBetween('vendas.created_at', [periodo.inicio, periodo.fim])
    }

    if (filtro.pos_id) query = query.where('pos.id', filtro.pos_id)
    if (filtro.caixa_id) query = query.where('caixa.id', filtro.caixa_id)
    if (filtro.user_id) query = query.where('caixa.user_id', filtro.user_id)
    if (filtro.cliente_id) {
      query = query.where((sub) => {
        sub
          .where('vendas.cliente_presencial_id', filtro.cliente_id!)
          .orWhere('vendas.cliente_online_id', filtro.cliente_id!)
      })
    }

    return query
  }

  private async faturacaoNoPeriodo(filtro: RelatoriosFilterDTO, periodo: Periodo) {
    const row = await this.baseVendas(filtro, periodo).count('* as quantidade').sum('vendas.total as total').first()
    return { quantidade: Number(row?.quantidade ?? 0), total: Number(row?.total ?? 0) }
  }

  private async custoNoPeriodo(filtro: RelatoriosFilterDTO, periodo: Periodo) {
    let query = db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereNull('venda_itens.deleted_at')
      .whereBetween('vendas.created_at', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) query = query.where('pos.id', filtro.pos_id)
    if (filtro.caixa_id) query = query.where('caixa.id', filtro.caixa_id)
    if (filtro.user_id) query = query.where('caixa.user_id', filtro.user_id)

    const row = await query
      .select(db.raw('SUM(venda_itens.quantidade * lote_produto.preco_compra) as custo_total'))
      .first()
    return Number(row?.custo_total ?? 0)
  }

  /** IVA liquidado (estimativa) — só calculado quando a empresa está no regime de IVA e
   * tem uma taxa atribuída (`empresa.taxa_iva_id`); extrai a componente de imposto de um
   * total já com imposto incluído: iva = total * percentual / (100 + percentual). */
  private async ivaLiquidado(companyAlias: string, totalFaturado: number) {
    const empresa = await Empresa.query()
      .where('company_alias', companyAlias)
      .preload('taxaIva')
      .firstOrFail()

    if (!empresa.regime_iva || !empresa.taxaIva) {
      return null
    }

    const percentual = Number(empresa.taxaIva.percentual)
    return Number(((totalFaturado * percentual) / (100 + percentual)).toFixed(2))
  }

  /**
   * Dashboard executivo: todos os KPIs principais numa só chamada, calculados com o menor
   * número de queries possível (agregações no MySQL, nunca somando em JS). `valor_por_receber`
   * fica sempre 0 — este projecto não tem conceito de venda a crédito ao cliente final
   * (fecho de venda exige pagamento total imediato, ver VendaSemPagamentoException/
   * VendaPagamentoIncompletoException); "contas a receber" reais existem só ao nível da
   * plataforma (cobrança de subscrição às empresas — ver relatorios_plataforma_repository.ts).
   */
  async dashboardExecutivo(filtro: RelatoriosFilterDTO) {
    const agora = DateTime.now()
    const hoje: Periodo = { inicio: agora.startOf('day').toJSDate(), fim: agora.endOf('day').toJSDate() }
    const semana: Periodo = { inicio: agora.startOf('week').toJSDate(), fim: agora.endOf('week').toJSDate() }
    const mes: Periodo = { inicio: agora.startOf('month').toJSDate(), fim: agora.endOf('month').toJSDate() }
    const ano: Periodo = { inicio: agora.startOf('year').toJSDate(), fim: agora.endOf('year').toJSDate() }

    const [faturacaoHoje, faturacaoSemana, faturacaoMes, faturacaoAno, custoMes] = await Promise.all([
      this.faturacaoNoPeriodo(filtro, hoje),
      this.faturacaoNoPeriodo(filtro, semana),
      this.faturacaoNoPeriodo(filtro, mes),
      this.faturacaoNoPeriodo(filtro, ano),
      this.custoNoPeriodo(filtro, mes),
    ])

    const numeroFaturasRow = await db
      .from('factura')
      .join('empresa', 'empresa.id', 'factura.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('factura.status', 'emitida')
      .whereBetween('factura.data_emissao', [mes.inicio, mes.fim])
      .count('* as quantidade')
      .first()

    const numeroClientesRow = await this.baseVendas(filtro, mes)
      .whereNotNull('vendas.cliente_presencial_id')
      .countDistinct('vendas.cliente_presencial_id as quantidade')
      .first()

    const valorRecebidoRow = await db
      .from('vendapagamento')
      .join('vendas', 'vendas.id', 'vendapagamento.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .whereBetween('vendapagamento.created_at', [mes.inicio, mes.fim])
      .sum('vendapagamento.valor as total')
      .first()

    const despesasMesRow = await db
      .from('despesas')
      .join('empresa', 'empresa.id', 'despesas.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .whereNull('despesas.deleted_at')
      .whereBetween('despesas.data_despesa', [mes.inicio, mes.fim])
      .sum('despesas.valor as total')
      .first()

    const saldoCaixaRow = await db
      .from('caixa')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('caixa.status', 'Aberto')
      .whereNull('caixa.deleted_at')
      .sum('caixa.total_caixa as total')
      .first()

    const vendasPorTipo = await this.baseVendas(filtro, mes)
      .groupBy('vendas.venda_tipo')
      .select('vendas.venda_tipo')
      .count('* as quantidade')
      .sum('vendas.total as total')

    const porTipo = (tipo: string) => {
      const linha = vendasPorTipo.find((r: any) => r.venda_tipo === tipo)
      return { quantidade: Number(linha?.quantidade ?? 0), total: Number(linha?.total ?? 0) }
    }

    const lucroBrutoMes = Number((faturacaoMes.total - custoMes).toFixed(2))
    const margemLucroMes = faturacaoMes.total > 0 ? Number(((lucroBrutoMes / faturacaoMes.total) * 100).toFixed(2)) : 0

    return {
      faturacao_hoje: faturacaoHoje,
      faturacao_semana: faturacaoSemana,
      faturacao_mes: faturacaoMes,
      faturacao_ano: faturacaoAno,
      numero_faturas_mes: Number(numeroFaturasRow?.quantidade ?? 0),
      numero_clientes_mes: Number(numeroClientesRow?.quantidade ?? 0),
      ticket_medio_mes: faturacaoMes.quantidade > 0 ? Number((faturacaoMes.total / faturacaoMes.quantidade).toFixed(2)) : 0,
      valor_recebido_mes: Number(valorRecebidoRow?.total ?? 0),
      // Sem conceito de venda a crédito ao cliente final neste projecto — ver nota acima.
      valor_por_receber_mes: 0,
      lucro_bruto_mes: lucroBrutoMes,
      margem_lucro_mes: margemLucroMes,
      iva_liquidado_mes: await this.ivaLiquidado(filtro.company_alias, faturacaoMes.total),
      despesas_mes: Number(despesasMesRow?.total ?? 0),
      saldo_caixa: Number(saldoCaixaRow?.total ?? 0),
      vendas_presenciais_mes: porTipo('presencial'),
      vendas_online_mes: porTipo('online'),
      vendas_cliente_online_mes: porTipo('online_loja'),
    }
  }

  /** Alias de `dashboardExecutivo` — "KPIs Gerais" é o mesmo conjunto de indicadores, só
   * com outro nome no pedido original; evita duplicar as mesmas queries. */
  kpisGerais(filtro: RelatoriosFilterDTO) {
    return this.dashboardExecutivo(filtro)
  }

  /** Faturação num período arbitrário (por omissão, o mês corrente). */
  async faturacaoPorPeriodo(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)
    const faturacao = await this.faturacaoNoPeriodo(filtro, periodo)
    return { periodo, ...faturacao }
  }

  /** Evolução das vendas por dia/semana/mês/ano, num período (por omissão, o mês corrente). */
  async evolucaoVendas(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)
    const granularidade = filtro.granularidade ?? 'dia'

    const formatos: Record<string, string> = {
      dia: "DATE_FORMAT(vendas.created_at, '%Y-%m-%d')",
      semana: "DATE_FORMAT(vendas.created_at, '%x-%v')",
      mes: "DATE_FORMAT(vendas.created_at, '%Y-%m')",
      ano: "DATE_FORMAT(vendas.created_at, '%Y')",
    }
    const grupoSql = formatos[granularidade]

    return this.baseVendas(filtro, periodo)
      .groupByRaw(grupoSql)
      .select(db.raw(`${grupoSql} as periodo`))
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .orderBy('periodo', 'asc')
  }

  /** Produtos mais vendidos (por receita), num período (por omissão, o mês corrente). */
  async topProdutos(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    let query = db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereNull('venda_itens.deleted_at')
      .whereBetween('vendas.created_at', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) query = query.where('pos.id', filtro.pos_id)
    if (filtro.produto_categoria_id) {
      query = query
        .join('categorias_produtos', 'categorias_produtos.produto_id', 'produtos.id')
        .where('categorias_produtos.produto_categoria_id', filtro.produto_categoria_id)
    }
    if (filtro.marca_id) query = query.where('produtos.marca_id', filtro.marca_id)
    if (filtro.fornecedor_id) query = query.where('produtos.fornecedor_id', filtro.fornecedor_id)

    return query
      .groupBy('produtos.id', 'produtos.nome')
      .select('produtos.id as produto_id', 'produtos.nome as produto_nome')
      .sum('venda_itens.quantidade as quantidade_vendida')
      .sum('venda_itens.total as receita_total')
      .orderBy('receita_total', 'desc')
      .limit(filtro.limit ?? LIMIT_TOP_OMISSAO)
  }

  /** Categorias mais vendidas (por receita), num período (por omissão, o mês corrente). */
  async topCategorias(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    let query = db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('categorias_produtos', 'categorias_produtos.produto_id', 'lote_produto.produto_id')
      .join('produto_categorias', 'produto_categorias.id', 'categorias_produtos.produto_categoria_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereNull('venda_itens.deleted_at')
      .whereBetween('vendas.created_at', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) query = query.where('pos.id', filtro.pos_id)

    return query
      .groupBy('produto_categorias.id', 'produto_categorias.nome')
      .select('produto_categorias.id as categoria_id', 'produto_categorias.nome as categoria_nome')
      .sum('venda_itens.quantidade as quantidade_vendida')
      .sum('venda_itens.total as receita_total')
      .orderBy('receita_total', 'desc')
      .limit(filtro.limit ?? LIMIT_TOP_OMISSAO)
  }

  /** Clientes que mais compraram (por valor), num período (por omissão, o mês corrente). */
  async topClientes(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    return this.baseVendas(filtro, periodo)
      .join('cliente', 'cliente.id', 'vendas.cliente_presencial_id')
      .groupBy('cliente.id', 'cliente.nome')
      .select('cliente.id as cliente_id', 'cliente.nome as cliente_nome')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .orderBy('vendas_total', 'desc')
      .limit(filtro.limit ?? LIMIT_TOP_OMISSAO)
  }

  /** Vendedores com melhor desempenho (por receita), num período (por omissão, o mês corrente). */
  async topVendedores(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    return this.baseVendas(filtro, periodo)
      .join('user', 'user.id', 'caixa.user_id')
      .groupBy('user.id', 'user.username', 'user.email')
      .select('user.id as user_id', 'user.username as user_nome', 'user.email as user_email')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .orderBy('vendas_total', 'desc')
      .limit(filtro.limit ?? LIMIT_TOP_OMISSAO)
  }

  /**
   * Relatório de Vendas — lista paginada com todos os filtros aplicáveis (data, loja,
   * caixa, cliente, vendedor, estado, método de pagamento), mais o total agregado do
   * conjunto filtrado (não só da página actual).
   */
  async relatorioVendas(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)
    let query = this.baseVendas(filtro, periodo)

    if (filtro.metodo_pagamento_id) {
      query = query
        .join('vendapagamento', 'vendapagamento.venda_id', 'vendas.id')
        .where('vendapagamento.metodo_pagamento_id', filtro.metodo_pagamento_id)
    }

    const resumo = await query
      .clone()
      .countDistinct('vendas.id as quantidade')
      .sum('vendas.total as total')
      .first()

    const linhas = await query
      .clone()
      .select(
        'vendas.id',
        'vendas.status',
        'vendas.venda_tipo',
        'vendas.total',
        'vendas.valor_desconto',
        'vendas.created_at',
        'caixa.id as caixa_id',
        'pos.id as pos_id',
        'pos.nome as pos_nome'
      )
      .groupBy('vendas.id')
      .orderBy('vendas.created_at', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)

    return {
      resumo: { quantidade: Number(resumo?.quantidade ?? 0), total: Number(resumo?.total ?? 0) },
      vendas: linhas,
    }
  }

  /** Relatório de Clientes — nº de compras, total gasto e ticket médio por cliente, num período. */
  async relatorioClientes(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    return this.baseVendas(filtro, periodo)
      .join('cliente', 'cliente.id', 'vendas.cliente_presencial_id')
      .groupBy('cliente.id', 'cliente.nome', 'cliente.nif', 'cliente.telefone', 'cliente.email')
      .select(
        'cliente.id as cliente_id',
        'cliente.nome as cliente_nome',
        'cliente.nif as cliente_nif',
        'cliente.telefone as cliente_telefone',
        'cliente.email as cliente_email'
      )
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .avg('vendas.total as ticket_medio')
      .max('vendas.created_at as ultima_compra')
      .orderBy('vendas_total', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)
  }

  /** Relatório por Método de Pagamento — valor recebido e nº de pagamentos por método, num período. */
  async relatorioMetodoPagamento(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    let query = db
      .from('vendapagamento')
      .join('vendas', 'vendas.id', 'vendapagamento.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('metodopagamento', 'metodopagamento.id', 'vendapagamento.metodo_pagamento_id')
      .where('empresa.company_alias', filtro.company_alias)
      .whereBetween('vendapagamento.created_at', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) query = query.where('pos.id', filtro.pos_id)
    if (filtro.caixa_id) query = query.where('caixa.id', filtro.caixa_id)
    if (filtro.user_id) query = query.where('caixa.user_id', filtro.user_id)

    return query
      .groupBy('metodopagamento.id', 'metodopagamento.nome')
      .select('metodopagamento.id as metodo_pagamento_id', 'metodopagamento.nome as metodo_pagamento_nome')
      .count('vendapagamento.id as pagamentos_quantidade')
      .sum('vendapagamento.valor as valor_total')
      .orderBy('valor_total', 'desc')
  }

  /**
   * Relatório de Produtos — desempenho de vendas (quantidade, receita, custo, margem) e
   * estoque actual por produto, filtrável por categoria/marca/fabricante/fornecedor.
   */
  async relatorioProdutos(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    let vendasQuery = db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereNull('venda_itens.deleted_at')
      .whereBetween('vendas.created_at', [periodo.inicio, periodo.fim])

    if (filtro.produto_categoria_id) {
      vendasQuery = vendasQuery
        .join('categorias_produtos', 'categorias_produtos.produto_id', 'produtos.id')
        .where('categorias_produtos.produto_categoria_id', filtro.produto_categoria_id)
    }
    if (filtro.marca_id) vendasQuery = vendasQuery.where('produtos.marca_id', filtro.marca_id)
    if (filtro.fornecedor_id) vendasQuery = vendasQuery.where('produtos.fornecedor_id', filtro.fornecedor_id)
    if (filtro.produto_id) vendasQuery = vendasQuery.where('produtos.id', filtro.produto_id)

    return vendasQuery
      .groupBy('produtos.id', 'produtos.nome')
      .select(
        'produtos.id as produto_id',
        'produtos.nome as produto_nome',
        db.raw('SUM(venda_itens.quantidade * lote_produto.preco_compra) as custo_total')
      )
      .sum('venda_itens.quantidade as quantidade_vendida')
      .sum('venda_itens.total as receita_total')
      .orderBy('receita_total', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)
  }

  /** Relatório de Stock — estoque actual (quantidade e valor ao preço de compra) por produto. */
  async relatorioStock(filtro: RelatoriosFilterDTO) {
    let query = db
      .from('lote_produto')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .whereNull('lote_produto.deleted_at')
      .whereNull('produtos.deleted_at')

    if (filtro.produto_categoria_id) {
      query = query
        .join('categorias_produtos', 'categorias_produtos.produto_id', 'produtos.id')
        .where('categorias_produtos.produto_categoria_id', filtro.produto_categoria_id)
    }
    if (filtro.marca_id) query = query.where('produtos.marca_id', filtro.marca_id)
    if (filtro.fornecedor_id) query = query.where('produtos.fornecedor_id', filtro.fornecedor_id)
    if (filtro.produto_id) query = query.where('produtos.id', filtro.produto_id)

    return query
      .groupBy('produtos.id', 'produtos.nome', 'produtos.is_service')
      .select(
        'produtos.id as produto_id',
        'produtos.nome as produto_nome',
        'produtos.is_service',
        db.raw('SUM(lote_produto.quantidade_em_estoque * lote_produto.preco_compra) as valor_em_estoque')
      )
      .sum('lote_produto.quantidade_em_estoque as quantidade_em_estoque')
      .orderBy('quantidade_em_estoque', 'asc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)
  }

  /** Relatório de Compras — movimentações de entrada de estoque (compras/reposições), num período. */
  async relatorioCompras(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)
    const movimentacoesEntrada = ['entrada', 'ajuste_positivo', 'transferencia_entrada']

    let query = db
      .from('estoque')
      .join('lote_produto', 'lote_produto.id', 'estoque.lote_produto_id')
      .join('produtos', 'produtos.id', 'estoque.produto_id')
      .join('pos', 'pos.id', 'estoque.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .whereIn('estoque.tipo_movimentacao', movimentacoesEntrada)
      .whereBetween('estoque.created_at', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) query = query.where('pos.id', filtro.pos_id)
    if (filtro.produto_id) query = query.where('produtos.id', filtro.produto_id)
    if (filtro.fornecedor_id) query = query.where('produtos.fornecedor_id', filtro.fornecedor_id)

    const resumo = await query
      .clone()
      .select(db.raw('SUM(estoque.quantidade * lote_produto.preco_compra) as valor_total'))
      .sum('estoque.quantidade as quantidade_total')
      .first()

    const linhas = await query
      .clone()
      .select(
        'estoque.id',
        'estoque.quantidade',
        'estoque.tipo_movimentacao',
        'estoque.motivo',
        'estoque.created_at',
        'produtos.id as produto_id',
        'produtos.nome as produto_nome',
        'pos.id as pos_id',
        'pos.nome as pos_nome'
      )
      .orderBy('estoque.created_at', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)

    return {
      resumo: {
        quantidade_total: Number(resumo?.quantidade_total ?? 0),
        valor_total: Number(resumo?.valor_total ?? 0),
      },
      compras: linhas,
    }
  }

  /** Relatório de Lucro — receita, custo (COGS) e margem, agregados por dia/semana/mês/ano. */
  async relatorioLucro(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)
    const granularidade = filtro.granularidade ?? 'mes'

    const formatos: Record<string, string> = {
      dia: "DATE_FORMAT(vendas.created_at, '%Y-%m-%d')",
      semana: "DATE_FORMAT(vendas.created_at, '%x-%v')",
      mes: "DATE_FORMAT(vendas.created_at, '%Y-%m')",
      ano: "DATE_FORMAT(vendas.created_at, '%Y')",
    }
    const grupoSql = formatos[granularidade]

    let query = db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereNull('venda_itens.deleted_at')
      .whereBetween('vendas.created_at', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) query = query.where('pos.id', filtro.pos_id)

    const linhas = await query
      .groupByRaw(grupoSql)
      .select(
        db.raw(`${grupoSql} as periodo`),
        db.raw('SUM(venda_itens.quantidade * lote_produto.preco_compra) as custo')
      )
      .sum('venda_itens.total as receita')
      .orderBy('periodo', 'asc')

    return linhas.map((linha: any) => {
      const receita = Number(linha.receita ?? 0)
      const custo = Number(linha.custo ?? 0)
      const lucro = Number((receita - custo).toFixed(2))
      return {
        periodo: linha.periodo,
        receita,
        custo,
        lucro,
        margem: receita > 0 ? Number(((lucro / receita) * 100).toFixed(2)) : 0,
      }
    })
  }

  /** Relatório de Impostos — IVA liquidado (estimado) por dia/semana/mês/ano, num período. */
  async relatorioImpostos(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)
    const granularidade = filtro.granularidade ?? 'mes'

    const empresa = await Empresa.query().where('company_alias', filtro.company_alias).preload('taxaIva').firstOrFail()

    if (!empresa.regime_iva || !empresa.taxaIva) {
      // `empresa.regime_iva` vem do mysql2 como 0/1 (TINYINT), não true/false — sem o
      // cast, este ramo devolvia um número em vez de boolean (o ramo "com regime" abaixo
      // já devolve um `true` literal, por isso só este lado tinha o problema).
      return { regime_iva: Boolean(empresa.regime_iva), taxa_percentual: null, periodos: [] }
    }

    const formatos: Record<string, string> = {
      dia: "DATE_FORMAT(vendas.created_at, '%Y-%m-%d')",
      semana: "DATE_FORMAT(vendas.created_at, '%x-%v')",
      mes: "DATE_FORMAT(vendas.created_at, '%Y-%m')",
      ano: "DATE_FORMAT(vendas.created_at, '%Y')",
    }
    const grupoSql = formatos[granularidade]

    const linhas = await this.baseVendas(filtro, periodo)
      .groupByRaw(grupoSql)
      .select(db.raw(`${grupoSql} as periodo`))
      .sum('vendas.total as faturacao_total')

    const percentual = Number(empresa.taxaIva.percentual)

    return {
      regime_iva: true,
      taxa_percentual: percentual,
      periodos: linhas.map((linha: any) => {
        const faturacaoTotal = Number(linha.faturacao_total ?? 0)
        return {
          periodo: linha.periodo,
          faturacao_total: faturacaoTotal,
          iva_liquidado: Number(((faturacaoTotal * percentual) / (100 + percentual)).toFixed(2)),
        }
      }),
    }
  }

  /** Relatório de Utilizadores — desempenho de vendas e papéis atribuídos, por utilizador. */
  async relatorioUtilizadores(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    let query = db
      .from('user')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .leftJoin('caixa', 'caixa.user_id', 'user.id')
      .leftJoin('vendas', (join) => {
        join
          .on('vendas.caixa_id', 'caixa.id')
          .andOnVal('vendas.status', STATUS_FATURADA)
          .andOnBetween('vendas.created_at', [periodo.inicio, periodo.fim])
      })
      .where('empresa.company_alias', filtro.company_alias)

    if (filtro.user_id) query = query.where('user.id', filtro.user_id)

    return query
      .groupBy('user.id', 'user.username', 'user.email')
      .select('user.id as user_id', 'user.username as user_nome', 'user.email as user_email')
      .countDistinct('caixa.id as caixas_abertas')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .orderBy('vendas_total', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)
  }

  /** Relatório de Descontos — vendas com desconto aplicado (via cupão), num período. */
  async relatorioDescontos(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    const resumo = await this.baseVendas(filtro, periodo)
      .where('vendas.valor_desconto', '>', 0)
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.valor_desconto as desconto_total')
      .first()

    const porCupom = await this.baseVendas(filtro, periodo)
      .where('vendas.valor_desconto', '>', 0)
      .join('cupom', 'cupom.id', 'vendas.cupom_id')
      .groupBy('cupom.id', 'cupom.codigo')
      .select('cupom.id as cupom_id', 'cupom.codigo as cupom_codigo')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.valor_desconto as desconto_total')
      .orderBy('desconto_total', 'desc')

    return {
      resumo: {
        vendas_quantidade: Number(resumo?.vendas_quantidade ?? 0),
        desconto_total: Number(resumo?.desconto_total ?? 0),
      },
      por_cupom: porCupom,
    }
  }

  /** Relatório de Documentos Anulados — facturas/notas anuladas, num período. */
  async relatorioDocumentosAnulados(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    return db
      .from('factura')
      .join('empresa', 'empresa.id', 'factura.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('factura.status', 'anulada')
      .whereBetween('factura.data_emissao', [periodo.inicio, periodo.fim])
      .select('factura.*')
      .orderBy('factura.data_emissao', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)
  }

  /** Relatório de Notas de Crédito — facturas do tipo "Nota de Crédito", num período. */
  async relatorioNotasCredito(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    return db
      .from('factura')
      .join('empresa', 'empresa.id', 'factura.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('factura.tipo', 'Nota de Crédito')
      .whereBetween('factura.data_emissao', [periodo.inicio, periodo.fim])
      .select('factura.*')
      .orderBy('factura.data_emissao', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)
  }

  /** Relatório de Rentabilidade — margem % por produto, num período (produtos mais rentáveis primeiro). */
  async relatorioRentabilidade(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)

    let query = db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .where('empresa.company_alias', filtro.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereNull('venda_itens.deleted_at')
      .whereBetween('vendas.created_at', [periodo.inicio, periodo.fim])

    if (filtro.produto_categoria_id) {
      query = query
        .join('categorias_produtos', 'categorias_produtos.produto_id', 'produtos.id')
        .where('categorias_produtos.produto_categoria_id', filtro.produto_categoria_id)
    }

    const linhas = await query
      .groupBy('produtos.id', 'produtos.nome')
      .select(
        'produtos.id as produto_id',
        'produtos.nome as produto_nome',
        db.raw('SUM(venda_itens.quantidade * lote_produto.preco_compra) as custo_total')
      )
      .sum('venda_itens.total as receita_total')
      .havingRaw('SUM(venda_itens.total) > 0')

    return linhas
      .map((linha: any) => {
        const receita = Number(linha.receita_total ?? 0)
        const custo = Number(linha.custo_total ?? 0)
        const lucro = Number((receita - custo).toFixed(2))
        return {
          produto_id: linha.produto_id,
          produto_nome: linha.produto_nome,
          receita_total: receita,
          custo_total: custo,
          lucro_total: lucro,
          margem_percentual: receita > 0 ? Number(((lucro / receita) * 100).toFixed(2)) : 0,
        }
      })
      .sort((a, b) => b.margem_percentual - a.margem_percentual)
  }

  /**
   * Relatórios Comparativos — hoje/ontem, mês actual/anterior ou ano actual/anterior,
   * com variação absoluta e percentual entre os dois períodos.
   */
  async comparativo(filtro: RelatoriosFilterDTO) {
    const agora = DateTime.now()
    const tipo = filtro.tipo_comparativo ?? 'mes_atual_anterior'

    let atual: Periodo
    let anterior: Periodo

    if (tipo === 'hoje_ontem') {
      atual = { inicio: agora.startOf('day').toJSDate(), fim: agora.endOf('day').toJSDate() }
      const ontem = agora.minus({ days: 1 })
      anterior = { inicio: ontem.startOf('day').toJSDate(), fim: ontem.endOf('day').toJSDate() }
    } else if (tipo === 'ano_atual_anterior') {
      atual = { inicio: agora.startOf('year').toJSDate(), fim: agora.endOf('year').toJSDate() }
      const anoAnterior = agora.minus({ years: 1 })
      anterior = { inicio: anoAnterior.startOf('year').toJSDate(), fim: anoAnterior.endOf('year').toJSDate() }
    } else {
      atual = { inicio: agora.startOf('month').toJSDate(), fim: agora.endOf('month').toJSDate() }
      const mesAnterior = agora.minus({ months: 1 })
      anterior = { inicio: mesAnterior.startOf('month').toJSDate(), fim: mesAnterior.endOf('month').toJSDate() }
    }

    const [faturacaoAtual, faturacaoAnterior] = await Promise.all([
      this.faturacaoNoPeriodo(filtro, atual),
      this.faturacaoNoPeriodo(filtro, anterior),
    ])

    const variacaoAbsoluta = Number((faturacaoAtual.total - faturacaoAnterior.total).toFixed(2))
    const variacaoPercentual =
      faturacaoAnterior.total > 0 ? Number(((variacaoAbsoluta / faturacaoAnterior.total) * 100).toFixed(2)) : null

    return {
      tipo_comparativo: tipo,
      atual: { periodo: atual, ...faturacaoAtual },
      anterior: { periodo: anterior, ...faturacaoAnterior },
      variacao_absoluta: variacaoAbsoluta,
      variacao_percentual: variacaoPercentual,
    }
  }

  /**
   * Fluxo de Caixa — entradas (pagamentos recebidos) vs saídas (despesas), por dia, num
   * período (por omissão, o mês corrente). Duas queries agregadas por dia (fontes
   * diferentes, não é possível um único JOIN sem duplicar valores) e uma junção leve em
   * memória por data — o volume por dia é sempre pequeno, nunca todas as linhas em bruto.
   */
  async fluxoCaixa(filtro: RelatoriosFilterDTO) {
    const periodo = this.resolvePeriodo(filtro)
    const diaSql = "DATE_FORMAT(vendapagamento.created_at, '%Y-%m-%d')"
    const diaDespesaSql = "DATE_FORMAT(despesas.data_despesa, '%Y-%m-%d')"

    let entradasQuery = db
      .from('vendapagamento')
      .join('vendas', 'vendas.id', 'vendapagamento.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .whereBetween('vendapagamento.created_at', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) entradasQuery = entradasQuery.where('pos.id', filtro.pos_id)

    const entradas = await entradasQuery
      .groupByRaw(diaSql)
      .select(db.raw(`${diaSql} as dia`))
      .sum('vendapagamento.valor as total')

    let saidasQuery = db
      .from('despesas')
      .join('empresa', 'empresa.id', 'despesas.empresa_id')
      .where('empresa.company_alias', filtro.company_alias)
      .whereNull('despesas.deleted_at')
      .whereBetween('despesas.data_despesa', [periodo.inicio, periodo.fim])

    if (filtro.pos_id) saidasQuery = saidasQuery.where('despesas.pos_id', filtro.pos_id)

    const saidas = await saidasQuery
      .groupByRaw(diaDespesaSql)
      .select(db.raw(`${diaDespesaSql} as dia`))
      .sum('despesas.valor as total')

    const dias = new Map<string, { dia: string; entradas: number; saidas: number }>()
    for (const linha of entradas as any[]) {
      dias.set(linha.dia, { dia: linha.dia, entradas: Number(linha.total ?? 0), saidas: 0 })
    }
    for (const linha of saidas as any[]) {
      const existente = dias.get(linha.dia) ?? { dia: linha.dia, entradas: 0, saidas: 0 }
      existente.saidas = Number(linha.total ?? 0)
      dias.set(linha.dia, existente)
    }

    let saldoAcumulado = 0
    return [...dias.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((linha) => {
        const saldoDia = Number((linha.entradas - linha.saidas).toFixed(2))
        saldoAcumulado = Number((saldoAcumulado + saldoDia).toFixed(2))
        return { ...linha, saldo_dia: saldoDia, saldo_acumulado: saldoAcumulado }
      })
  }
}
