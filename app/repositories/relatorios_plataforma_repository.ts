import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { RelatoriosPlataformaFilterDTO } from '#dtos/relatorios_plataforma_dto'

/**
 * Relatórios do PROPRIETÁRIO DA PLATAFORMA — deliberadamente cross-tenant (mesma excepção
 * documentada em `catalogo_publico_repository.ts`), nunca escopados por `company_alias`.
 * Rotas registadas em `start/routes.ts` (grupo de plataforma, `adminOnly()`), nunca em
 * `companydomainroutes.ts`.
 */
export default class RelatoriosPlataformaRepository {
  private resolvePeriodo(filtro: RelatoriosPlataformaFilterDTO) {
    const inicio = filtro.data_inicio
      ? DateTime.fromJSDate(filtro.data_inicio).startOf('day')
      : DateTime.now().startOf('month')
    const fim = filtro.data_fim ? DateTime.fromJSDate(filtro.data_fim).endOf('day') : DateTime.now().endOf('day')
    return { inicio: inicio.toJSDate(), fim: fim.toJSDate() }
  }

  /**
   * Contas a Receber da plataforma — cobranças de subscrição às empresas clientes, ainda
   * por pagar (`pago = false`), com o nome da empresa e do plano. Este projecto não tem
   * conceito de venda a crédito ao cliente final (ver relatorios_repository.ts); "contas a
   * receber" real só existe aqui, ao nível da plataforma.
   */
  async contasReceber(filtro: RelatoriosPlataformaFilterDTO) {
    let query = db
      .from('cobranca')
      .join('subscricao', 'subscricao.id', 'cobranca.subscricao_id')
      .join('empresa', 'empresa.id', 'subscricao.cliente_id')
      .join('plano', 'plano.id', 'subscricao.plano_id')
      .where('cobranca.pago', false)
      .whereNull('cobranca.deleted_at')

    if (filtro.status) query = query.where('cobranca.status', filtro.status)
    if (filtro.data_inicio || filtro.data_fim) {
      const { inicio, fim } = this.resolvePeriodo(filtro)
      query = query.whereBetween('cobranca.data_vencimento', [inicio, fim])
    }

    const resumo = await query
      .clone()
      .count('* as quantidade')
      .sum('cobranca.valor as total')
      .first()

    const linhas = await query
      .clone()
      .select(
        'cobranca.id',
        'cobranca.valor',
        'cobranca.moeda',
        'cobranca.status',
        'cobranca.data_vencimento',
        'cobranca.referencia',
        'empresa.id as empresa_id',
        'empresa.nome as empresa_nome',
        'plano.nome as plano_nome'
      )
      .orderBy('cobranca.data_vencimento', 'asc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)

    return {
      resumo: { quantidade: Number(resumo?.quantidade ?? 0), total: Number(resumo?.total ?? 0) },
      cobrancas: linhas,
    }
  }

  /**
   * Receita da plataforma (cobranças pagas), num período (por omissão, o mês corrente).
   * Filtra por `created_at` — a coluna `data_emissao` está declarada no model `Cobranca`
   * mas nunca chegou a existir na tabela (migration com essa linha comentada); não é
   * alterada aqui (fora do âmbito desta tarefa), só evitada.
   */
  async receitaPlataforma(filtro: RelatoriosPlataformaFilterDTO) {
    const { inicio, fim } = this.resolvePeriodo(filtro)

    const receita = await db
      .from('cobranca')
      .where('cobranca.pago', true)
      .whereNull('cobranca.deleted_at')
      .whereBetween('cobranca.created_at', [inicio, fim])
      .count('* as quantidade')
      .sum('cobranca.valor as total')
      .first()

    const subscricoesAtivas = await db
      .from('subscricao')
      .where('subscricao.status', 'ATIVA')
      .whereNull('subscricao.deleted_at')
      .count('* as quantidade')
      .first()

    return {
      periodo: { inicio, fim },
      cobrancas_pagas: { quantidade: Number(receita?.quantidade ?? 0), total: Number(receita?.total ?? 0) },
      subscricoes_ativas: Number(subscricoesAtivas?.quantidade ?? 0),
    }
  }

  /** Resumo das empresas clientes da plataforma: total, activas, inadimplentes, por tamanho. */
  async empresasResumo() {
    const totais = await db
      .from('empresa')
      .whereNull('empresa.deleted_at')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(empresa.status = true) as ativas'),
        db.raw('SUM(empresa.inadiplente = true) as inadimplentes')
      )
      .first()

    const porTamanho = await db
      .from('empresa')
      .whereNull('empresa.deleted_at')
      .groupBy('empresa.tamanho')
      .select('empresa.tamanho')
      .count('* as quantidade')

    return {
      total_empresas: Number(totais?.total ?? 0),
      empresas_ativas: Number(totais?.ativas ?? 0),
      empresas_inadimplentes: Number(totais?.inadimplentes ?? 0),
      por_tamanho: porTamanho,
    }
  }

  /**
   * Uso agregado da plataforma (cross-tenant, sem detalhe por empresa): vendas fechadas,
   * produtos e utilizadores, num período (por omissão, o mês corrente).
   */
  async usoPlataforma(filtro: RelatoriosPlataformaFilterDTO) {
    const { inicio, fim } = this.resolvePeriodo(filtro)

    const vendas = await db
      .from('vendas')
      .where('vendas.status', 'fechada')
      .whereBetween('vendas.created_at', [inicio, fim])
      .count('* as quantidade')
      .sum('vendas.total as total')
      .first()

    const produtos = await db.from('produtos').whereNull('produtos.deleted_at').count('* as total').first()
    const utilizadores = await db.from('user').count('* as total').first()

    return {
      periodo: { inicio, fim },
      vendas_fechadas: { quantidade: Number(vendas?.quantidade ?? 0), total: Number(vendas?.total ?? 0) },
      produtos_totais: Number(produtos?.total ?? 0),
      utilizadores_totais: Number(utilizadores?.total ?? 0),
    }
  }

  /** Relatório de Auditoria — eventos de segurança registados em `security_logs`, num período. */
  async auditoria(filtro: RelatoriosPlataformaFilterDTO) {
    const { inicio, fim } = this.resolvePeriodo(filtro)

    let query = db
      .from('security_logs')
      .whereBetween('security_logs.created_at', [inicio, fim])

    if (filtro.event) query = query.where('security_logs.event', filtro.event)

    return query
      .select('security_logs.*')
      .orderBy('security_logs.created_at', 'desc')
      .paginate(filtro.page ?? 1, filtro.limit ?? 20)
  }
}
