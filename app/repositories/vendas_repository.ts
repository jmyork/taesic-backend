import { CreateVendasDTO, VendaCloseDTO, VendaShowDTO, VendasQueryDTO } from '#dtos/vendas_dto'
import vendas from '#models/faturacao/vendas'
import Empresa from '#models/empresa'
import caixa from '#models/caixa'
import UserHasNoOpenCaixaException from '#exceptions/user_has_no_open_caixa_exception'
import UserHasAnOpenVendaException from '#exceptions/user_has_an_open_venda_exception'
import venda_itens from '#models/faturacao/venda_itens'
import VendaIsAlreadyOpenOrCloseException from '#exceptions/venda_is_already_open_or_close_exception'
import estoqueRepository from './estoque_repository.js'
import caixaRepository from './caixa_repository.js'
import posRepository from './pos_repository.js'
import cupomRepository from './cupom_repository.js'
import CupomInvalidoException from '#exceptions/cupom_invalido_exception'
import vendapagamento from '#models/vendapagamento'
import VendaSemPagamentoException from '#exceptions/venda_sem_pagamento_exception'
import VendaPagamentoIncompletoException from '#exceptions/venda_pagamento_incompleto_exception'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import emitter from '@adonisjs/core/services/emitter'
import VendaCanceladaAltoValor from '#events/venda_cancelada_alto_valor'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'
import { proximoNumeroPorEmpresa } from '../helpers/sequencial_numero.js'
import { assertPodeFacturar } from '../helpers/limites_do_plano.js'

const VENDAS_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'exact', column: 'vendas.numero', key: 'numero' },
  { kind: 'range', column: 'vendas.total', startKey: 'total_start', endKey: 'total_end', exactKey: 'total' },
  { kind: 'exact', column: 'vendas.venda_tipo', key: 'venda_tipo' },
  { kind: 'exact', column: 'vendas.caixa_id', key: 'caixa_id' },
  { kind: 'exact', column: 'vendas.cliente_online_id', key: 'cliente_online_id' },
  { kind: 'exact', column: 'vendas.cliente_presencial_id', key: 'cliente_presencial_id' },
]

export default class vendasRepository {
  baseQuery() {
    return vendas.query()
  }

  async paginate(page = 1, limit = 20, filter?: VendasQueryDTO) {
    const query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'vendas',
      fields: VENDAS_FILTER_FIELDS,
    })

    // `status` cobre os 4 estados directamente; `fechado` é um atalho booleano mais antigo
    // que só distingue aberta/fechada — mantido à parte por não ser um simples match de coluna.
    if (filter?.status) {
      query.where("vendas.status", filter.status)
    } else if (filter?.fechado === true) {
      query.where("vendas.status", "fechada")
    } else if (filter?.fechado === false) {
      query.where("vendas.status", "aberta")
    }

    // Junta caixa/pos/empresa/user sempre — vendas não tem FK directa a nenhum dos
    // dois, por isso mostrar/filtrar por vendedor ou por posto de venda só é possível
    // através deste join (caixa.user_id/caixa.pos_id).
    query
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('user', 'user.id', 'caixa.user_id')
      // leftJoin (nunca inner): indicar o cliente é OPCIONAL — uma venda a "Cliente
      // Final" tem cliente_presencial_id a null e não pode desaparecer da listagem.
      .leftJoin('cliente', 'cliente.id', 'vendas.cliente_presencial_id')
      // O documento tem de dizer QUAL o desconto aplicado, não só o valor — a venda só
      // guarda `cupom_id`.
      .leftJoin('cupom', 'cupom.id', 'vendas.cupom_id')

    if (filter?.company_alias) {
      query.where("empresa.company_alias", filter.company_alias)
    }

    if (filter?.empresa_id) {
      query.where("vendas.empresa_id", filter.empresa_id)
    }

    if (filter?.user_id) {
      query.where("caixa.user_id", filter.user_id)
    }

    if (filter?.pos_id) {
      if (Array.isArray(filter.pos_id)) {
        query.whereIn("caixa.pos_id", filter.pos_id)
      } else {
        query.where("caixa.pos_id", filter.pos_id)
      }
    }

    const paginator = await query
      .select(
        "vendas.*",
        "user.username as vendedor_nome",
        "pos.id as pos_id",
        "pos.nome as pos_nome",
        // A morada impressa na factura é a do POSTO onde a venda ocorreu, não a da sede.
        "pos.localizacao as pos_localizacao",
        "cupom.codigo as cupom_codigo",
        "cupom.desconto as cupom_desconto",
        // Sem isto a API só devolvia o UUID `cliente_presencial_id` — não havia forma
        // de mostrar o cliente numa listagem ou factura sem um pedido extra por linha.
        "cliente.nome as cliente_nome",
        "cliente.nif as cliente_nif",
        "cliente.numero as cliente_numero",
        "cliente.tipo as cliente_tipo"
      )
      .orderBy("vendas.created_at", "desc")
      .paginate(page, limit)

    // Colunas extra vindas de join (alias "as X") ficam em $extras — por omissão o
    // Lucid não as serializa para JSON sem isto (mesmo padrão documentado para os
    // agregados do catálogo de produtos).
    for (const venda of paginator.all()) {
      (venda as any).serializeExtras = () => venda.$extras
    }

    return paginator
  }

  async findOrFail(data: VendaShowDTO) {
    const venda = await this.baseQuery()
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .join('user', 'user.id', 'caixa.user_id')
      .leftJoin('cliente', 'cliente.id', 'vendas.cliente_presencial_id')
      // O documento tem de dizer QUAL o desconto aplicado, não só o valor — a venda só
      // guarda `cupom_id`.
      .leftJoin('cupom', 'cupom.id', 'vendas.cupom_id')
      .where('empresa.company_alias', data.company_alias ?? '')
      .where('vendas.id', data.id)
      // .where('caixa.user_id', data.user_id!)
      .select(
        'vendas.*',
        'user.username as vendedor_nome',
        'pos.id as pos_id',
        'pos.nome as pos_nome',
        'pos.localizacao as pos_localizacao',
        'cupom.codigo as cupom_codigo',
        'cupom.desconto as cupom_desconto',
        'cliente.nome as cliente_nome',
        'cliente.nif as cliente_nif',
        'cliente.numero as cliente_numero',
        'cliente.tipo as cliente_tipo'
      )
      .firstOrFail()

    // Mesmo padrão de paginate() — colunas de join ("as X") só chegam ao JSON com
    // serializeExtras definido por instância.
    ;(venda as any).serializeExtras = () => venda.$extras

    return venda
  }

  async create(data: CreateVendasDTO) {
    await Empresa.findByOrFail("company_alias", data.company_alias)

    const { company_alias, user_id, total, empresa_id, ...vendaData } = data
    // buscar o caixa aberto do usuário (se não for venda online) e validar que pertence à empresa
    const Caixa = await caixa.query()
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('caixa.user_id', user_id!)
      .where('caixa.status', 'aberto')
      .select('caixa.*')
      .first()

    if (!Caixa) {
      throw new UserHasNoOpenCaixaException()
    }

    // Uma proforma é só uma cotação — nunca bloqueia nem é bloqueada pela regra de "uma
    // venda aberta por utilizador" (essa regra só existe para vendas reais).
    if (!data.proforma) {
      // checar se tem venda aberta para o user — filtro por vendas.status directamente
      // na query (não só a checar o `.first()` depois), senão com múltiplas vendas
      // ligadas à mesma caixa (proformas incluídas) o `.first()` podia calhar numa que
      // não é a 'aberta' e nunca detectar a que realmente bloqueia.
      const ExistAnOpenVenda = await vendas.query()
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', company_alias ?? '')
        .where('caixa.user_id', user_id!)
        .where('caixa.status', 'aberto')
        .where('vendas.status', 'aberta')
        .select('vendas.*')
        .first()

      if (ExistAnOpenVenda) {
        throw new UserHasAnOpenVendaException()
      }
    }

    // Uma venda real só sabe o seu total real quando close() o calcula a partir dos
    // itens — 0 até lá, de propósito. Uma proforma nunca passa por close(), por isso é
    // a única altura em que o total (já conhecido do carrinho no momento da criação)
    // pode ser gravado.
    //
    // empresa_id vem de Caixa.empresa_id (já resolvido acima, sem query extra) — essa
    // caixa já existe e está aberta, por isso empresa_id só é null se o utilizador
    // responsável não tiver empresa associada (ver caixa.ts), caso em que a venda
    // também fica sem numero.
    if (!Caixa.empresa_id) {
      return vendas.create({
        cliente_presencial_id: vendaData.cliente_presencial_id,
        // `cliente_online_id` era aceite pelo validator e pelo controller mas nunca
        // chegava aqui a ser gravado — silenciosamente perdido. Corrigido.
        cliente_online_id: vendaData.cliente_online_id,
        venda_tipo: 'presencial',
        caixa_id: Caixa.id,
        total: data.proforma ? (total ?? 0) : 0,
        status: data.proforma ? 'proforma' : 'aberta',
      })
    }

    return db.transaction(async (trx) => {
      const numero = await proximoNumeroPorEmpresa(trx, Caixa.empresa_id!, vendas)
      return vendas.create(
        {
          cliente_presencial_id: vendaData.cliente_presencial_id,
          cliente_online_id: vendaData.cliente_online_id,
          venda_tipo: 'presencial',
          caixa_id: Caixa.id,
          total: data.proforma ? (total ?? 0) : 0,
          status: data.proforma ? 'proforma' : 'aberta',
          empresa_id: Caixa.empresa_id,
          numero,
        },
        { client: trx }
      )
    })
  }

  // async update(id: string, data: UpdateVendasDTO) {
  //   const venda = await this.findOrFail(id, data.company_alias)
  //   venda.merge(data)
  //   await venda.save()
  //   return venda
  // }

  async close(data: VendaCloseDTO) {
    const venda = await this.findOrFail(data)

    const VendaItens = await venda_itens.query()
      .where('venda_id', venda.id)
      .select('venda_itens.*')

    // Se não tiver itens, simplesmente fecha a venda sem calcular total e deleta.
    if (!VendaItens || VendaItens.length === 0) {
      await venda.delete()
      return venda
    }
    if (venda.status == 'fechada' || venda.status == 'cancelada' || venda.status == 'reembolsada' || venda.status == 'proforma') {
      throw new VendaIsAlreadyOpenOrCloseException()
    }

    const caixaRepo = new caixaRepository()
    const caixa = await caixaRepo.findOrFail(venda.caixa_id!, data.company_alias)

    const posRepo = new posRepository()
    const pos = await posRepo.findOrFail(caixa.pos_id, data.company_alias)

    const estoqueRepo = new estoqueRepository()

    // Calcular o total da venda somando os itens
    const total = VendaItens.reduce((sum, item) => sum + item.preco_unitario * item.quantidade, 0)

    // Resolver o cupão ANTES da transação — se for inválido, a venda não deve avançar de todo.
    let cupomId: string | null = null
    let valorDesconto = 0
    if (data.cupom_codigo) {
      const cupomRepo = new cupomRepository()
      const cupomEncontrado = await cupomRepo.findValidoPorCodigo(data.cupom_codigo, data.company_alias)
      if (!cupomEncontrado) {
        throw new CupomInvalidoException()
      }
      cupomId = cupomEncontrado.id
      valorDesconto = Math.min(Number((total * (cupomEncontrado.desconto / 100)).toFixed(2)), total)
    }

    // Uma venda nunca pode fechar sem se saber como foi paga: pelo menos um método de
    // pagamento com o respectivo valor, e a soma tem de bater certo com o total (menos
    // desconto) — nem a menos (pagamento incompleto) nem a mais (valor a mais não
    // reclamado por nenhum método).
    const totalAPagar = Number((total - valorDesconto).toFixed(2))
    const pagamentos = await vendapagamento
      .query()
      .where('venda_id', venda.id)
      .whereNull('deleted_at')

    if (pagamentos.length === 0) {
      throw new VendaSemPagamentoException()
    }

    const totalPago = Number(
      pagamentos.reduce((soma, pagamento) => soma + Number(pagamento.valor), 0).toFixed(2)
    )

    if (Math.abs(totalPago - totalAPagar) > 0.01) {
      throw new VendaPagamentoIncompletoException(totalAPagar, totalPago)
    }

    // Todas as movimentações de stock e a atualização da venda correm na mesma transação:
    // se uma falhar a meio (ex.: stock insuficiente num item), nada fica gravado a metade.
    return db.transaction(async (trx) => {
      // O tecto de facturação do plano. A PRIMEIRA coisa dentro da transacção, e
      // portanto antes de qualquer movimento de stock: recusar a meio obrigaria a
      // desfazer saídas de armazém já gravadas (e os alertas de stock já emitidos), e
      // recusar depois de fechar deixaria o tecto sempre ultrapassado por uma venda —
      // um tecto que se ultrapassa não é um tecto.
      //
      // DENTRO da transacção, e com o `trx`, e não antes dela: soma-se o já facturado e
      // depois grava-se, e entre as duas coisas cabe outra venda. Duas caixas a fechar
      // ao mesmo tempo passavam ambas pelo mesmo tecto. O lock é na linha da empresa —
      // ver `limites_do_plano.ts`.
      await assertPodeFacturar(pos.empresa_id, totalAPagar, trx)

      for (const item of VendaItens) {
        await estoqueRepo.create({
          pos_id: pos.id,
          registrado_por: data.user_id,
          motivo: `venda`,
          tipo_movimentacao: 'saida',
          quantidade: item.quantidade ?? 0,
          lote_produto_id: item.lote_produto_id,
          company_alias: data.company_alias,
        }, trx)
      }

      venda.total = total - valorDesconto
      venda.valor_desconto = valorDesconto
      venda.cupom_id = cupomId
      venda.status = 'fechada'
      venda.useTransaction(trx)
      await venda.save()

      // Uma venda efectivada entra na conta da caixa — total_vendas/total_caixa têm de
      // reflectir isso de imediato, não só no fecho da caixa.
      await caixaRepo.recalcularTotais(venda.caixa_id!, trx)

      return venda
    })
  }

  // Cancela uma venda ainda em aberto (nunca chegou a ser fechada). Ao contrário de close(),
  // não há stock a reverter aqui: o stock só é decrementado no momento do fecho da venda — por
  // isso uma venda cancelada nunca contribuiu para total_vendas/total_caixa da caixa (o seu
  // `total` continua em 0). Ainda assim recalculamos a caixa dentro da mesma transação: mantém
  // o estado sempre consistente com a fonte da verdade (as vendas), em vez de assumir que este
  // caso nunca precisa de ajuste.
  async cancel(data: VendaCloseDTO) {
    const venda = await this.findOrFail(data)

    if (venda.status !== 'aberta' && venda.status !== 'proforma') {
      throw new VendaIsAlreadyOpenOrCloseException()
    }

    const caixaRepo = new caixaRepository()

    await db.transaction(async (trx) => {
      venda.status = 'cancelada'
      venda.useTransaction(trx)
      await venda.save()

      await caixaRepo.recalcularTotais(venda.caixa_id!, trx)
    })

    await this.avisarSeCancelamentoAltoValor(venda.id, data.company_alias)

    return venda
  }

  /** Emite `VendaCanceladaAltoValor` quando o total dos itens de uma venda cancelada (ainda
   * aberta, por isso `vendas.total` nunca foi preenchido) excede o limiar configurado (env
   * `VENDA_CANCELADA_LIMIAR`, por omissão 50000). */
  private async avisarSeCancelamentoAltoValor(vendaId: string, companyAlias?: string) {
    try {
      const limiar = env.get('VENDA_CANCELADA_LIMIAR') ?? 50_000

      const itens = await venda_itens.query().where('venda_id', vendaId).whereNull('deleted_at')
      const total = itens.reduce((soma, item) => soma + item.preco_unitario * item.quantidade, 0)
      if (total < limiar) return

      await emitter.emit(
        VendaCanceladaAltoValor,
        new VendaCanceladaAltoValor(vendaId, companyAlias ?? '', total, limiar)
      )
    } catch (error) {
      console.error('Falha ao avaliar/emitir alerta de venda cancelada de alto valor:', error)
    }
  }

  // async softDelete(id: string, company_alias?: string, user_id?: string) {
  //   const venda = await this.findOrFail(id, company_alias, user_id)

  //   if (venda.deletedAt) {
  //     venda.deletedAt = null
  //   } else {
  //     venda.deletedAt = DateTime.now()
  //   }

  //   await venda.save()
  //   return venda
  // }
}