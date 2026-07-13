import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { MetricasPeriodoDTO, MetricasResumoDTO } from '#dtos/metricas_dto'

/** Só vendas fechadas contam como receita real — 'aberta'/'cancelada'/'reembolsada' nunca devem entrar em somas de faturação. */
const STATUS_FATURADA = 'fechada'

export default class MetricasRepository {
  /** Resumo geral da empresa para o dashboard: vendas de hoje/do mês, caixas abertas, lotes a expirar. */
  async resumo(data: MetricasResumoDTO) {
    const agora = DateTime.now()
    const inicioHoje = agora.startOf('day').toJSDate()
    const fimHoje = agora.endOf('day').toJSDate()
    const inicioMes = agora.startOf('month').toJSDate()
    const fimMes = agora.endOf('month').toJSDate()
    const daqui30Dias = agora.plus({ days: 30 }).toJSDate()

    const vendasHoje = await db
      .from('vendas')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereBetween('vendas.created_at', [inicioHoje, fimHoje])
      .count('* as quantidade')
      .sum('vendas.total as total')
      .first()

    const vendasMes = await db
      .from('vendas')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereBetween('vendas.created_at', [inicioMes, fimMes])
      .count('* as quantidade')
      .sum('vendas.total as total')
      .first()

    const caixasAbertas = await db
      .from('caixa')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .where('caixa.status', 'aberto')
      .whereNull('caixa.deleted_at')
      .count('* as quantidade')
      .first()

    const lotesAExpirar = await db
      .from('lote_produto')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .whereNull('lote_produto.deleted_at')
      .whereBetween('lote_produto.data_validade', [agora.toJSDate(), daqui30Dias])
      .count('* as quantidade')
      .first()

    const quantidadeVendasHoje = Number(vendasHoje?.quantidade ?? 0)
    const quantidadeVendasMes = Number(vendasMes?.quantidade ?? 0)
    const totalVendasMes = Number(vendasMes?.total ?? 0)

    return {
      vendas_hoje: { quantidade: quantidadeVendasHoje, total: Number(vendasHoje?.total ?? 0) },
      vendas_mes: { quantidade: quantidadeVendasMes, total: totalVendasMes },
      ticket_medio_mes: quantidadeVendasMes > 0 ? totalVendasMes / quantidadeVendasMes : 0,
      caixas_abertas: Number(caixasAbertas?.quantidade ?? 0),
      lotes_a_expirar: Number(lotesAExpirar?.quantidade ?? 0),
    }
  }

  private resolvePeriodo(data: MetricasPeriodoDTO) {
    const inicio = data.data_inicio
      ? DateTime.fromJSDate(data.data_inicio).startOf('day')
      : DateTime.now().startOf('month')
    const fim = data.data_fim ? DateTime.fromJSDate(data.data_fim).endOf('day') : DateTime.now().endOf('day')
    return { inicio: inicio.toJSDate(), fim: fim.toJSDate() }
  }

  /** Desempenho por ponto de venda: nº de vendas fechadas e receita, num período (por omissão, o mês corrente). */
  async porPosto(data: MetricasPeriodoDTO) {
    const { inicio, fim } = this.resolvePeriodo(data)

    return db
      .from('pos')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .leftJoin('caixa', 'caixa.pos_id', 'pos.id')
      .leftJoin('vendas', (query) => {
        query
          .on('vendas.caixa_id', 'caixa.id')
          .andOnVal('vendas.status', STATUS_FATURADA)
          .andOnBetween('vendas.created_at', [inicio, fim])
      })
      .where('empresa.company_alias', data.company_alias)
      .whereNull('pos.deleted_at')
      .groupBy('pos.id', 'pos.nome')
      .select('pos.id as pos_id', 'pos.nome as pos_nome')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .orderBy('pos.nome', 'asc')
  }

  /** Desempenho por vendedor (utilizador que teve a caixa aberta): nº de vendas fechadas e receita, num período. */
  async porVendedor(data: MetricasPeriodoDTO) {
    const { inicio, fim } = this.resolvePeriodo(data)

    return db
      .from('user')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .join('caixa', 'caixa.user_id', 'user.id')
      .join('vendas', (query) => {
        query.on('vendas.caixa_id', 'caixa.id').andOnVal('vendas.status', STATUS_FATURADA)
      })
      .where('empresa.company_alias', data.company_alias)
      .whereBetween('vendas.created_at', [inicio, fim])
      .groupBy('user.id', 'user.username', 'user.email')
      .select('user.id as user_id', 'user.username as user_nome', 'user.email as user_email')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .orderBy('vendas_total', 'desc')
  }

  /**
   * Tendência diária de vendas fechadas: nº de vendas e receita por dia do calendário, num período
   * (por omissão, o mês corrente). Só devolve dias com pelo menos uma venda fechada — não sintetiza
   * dias vazios com zero (isso é uma preocupação do frontend/serviço, se necessário).
   */
  async porDia(data: MetricasPeriodoDTO) {
    const { inicio, fim } = this.resolvePeriodo(data)
    // Mesma expressão usada no GROUP BY e no SELECT, para agrupar por dia de calendário e devolver
    // já o valor formatado (YYYY-MM-DD) como string, sem depender de como o driver representa DATE.
    const diaSql = "DATE_FORMAT(vendas.created_at, '%Y-%m-%d')"

    return db
      .from('vendas')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereBetween('vendas.created_at', [inicio, fim])
      .groupByRaw(diaSql)
      .select(db.raw(`${diaSql} as data`))
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .orderBy('data', 'asc')
  }

  /**
   * Resumo do impacto agregado de TODOS os promotores nesta empresa, num período (por omissão,
   * o mês corrente) — a vista que falta ao dono da empresa (o painel do promotor mostra o inverso:
   * o desempenho de UM promotor em todas as lojas onde tem cupão).
   */
  async promotoresResumo(data: MetricasPeriodoDTO) {
    const { inicio, fim } = this.resolvePeriodo(data)

    const vendas = await db
      .from('vendas')
      .join('cupom', 'cupom.id', 'vendas.cupom_id')
      .join('empresa', 'empresa.id', 'cupom.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereBetween('vendas.created_at', [inicio, fim])
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .sum('vendas.valor_desconto as valor_desconto_total')
      .first()

    const promotoresAtivos = await db
      .from('vendas')
      .join('cupom', 'cupom.id', 'vendas.cupom_id')
      .join('empresa', 'empresa.id', 'cupom.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereBetween('vendas.created_at', [inicio, fim])
      .countDistinct('cupom.promotor_id as quantidade')
      .first()

    // Leads só ficam associados a esta empresa quando vêm de um promotor DE DOMÍNIO desta
    // empresa (promotor.empresa_id = esta empresa) — leads de promotores de plataforma não têm
    // loja fixa (empresa_id null no lead), por isso não entram nesta contagem por empresa.
    const leads = await db
      .from('lead')
      .join('empresa', 'empresa.id', 'lead.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .whereBetween('lead.created_at', [inicio, fim])
      .count('* as quantidade')
      .first()

    return {
      vendas_quantidade: Number(vendas?.vendas_quantidade ?? 0),
      vendas_total: Number(vendas?.vendas_total ?? 0),
      valor_desconto_total: Number(vendas?.valor_desconto_total ?? 0),
      promotores_ativos_quantidade: Number(promotoresAtivos?.quantidade ?? 0),
      leads_quantidade: Number(leads?.quantidade ?? 0),
    }
  }

  /** Desempenho por promotor (só os que tiveram pelo menos uma venda no período), nesta empresa. */
  async promotoresPorPromotor(data: MetricasPeriodoDTO) {
    const { inicio, fim } = this.resolvePeriodo(data)

    return db
      .from('vendas')
      .join('cupom', 'cupom.id', 'vendas.cupom_id')
      .join('empresa', 'empresa.id', 'cupom.empresa_id')
      .join('promotor', 'promotor.id', 'cupom.promotor_id')
      .where('empresa.company_alias', data.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereBetween('vendas.created_at', [inicio, fim])
      .groupBy('promotor.id', 'promotor.nome')
      .select('promotor.id as promotor_id', 'promotor.nome as promotor_nome')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .sum('vendas.valor_desconto as valor_desconto_total')
      .orderBy('vendas_total', 'desc')
  }

  /** Produtos mais vendidos via cupão de QUALQUER promotor, nesta empresa, num período. */
  async promotoresPorProduto(data: MetricasPeriodoDTO) {
    const { inicio, fim } = this.resolvePeriodo(data)

    return db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('cupom', 'cupom.id', 'vendas.cupom_id')
      .join('empresa', 'empresa.id', 'cupom.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .where('empresa.company_alias', data.company_alias)
      .where('vendas.status', STATUS_FATURADA)
      .whereBetween('vendas.created_at', [inicio, fim])
      .groupBy('produtos.id', 'produtos.nome')
      .select('produtos.id as produto_id', 'produtos.nome as produto_nome')
      .sum('venda_itens.quantidade as quantidade_total')
      .sum('venda_itens.total as valor_total')
      .orderBy('valor_total', 'desc')
  }
}
