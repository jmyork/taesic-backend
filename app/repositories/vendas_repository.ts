import {
  CreateVendasDTO,
  VendaAjustarDTO,
  VendaCloseDTO,
  VendaEntregarDTO,
  VendaShowDTO,
  VendasQueryDTO,
} from '#dtos/vendas_dto'
import { DateTime } from 'luxon'
import vendas from '#models/faturacao/vendas'
import Empresa from '#models/empresa'
import caixa from '#models/caixa'
import UserHasNoOpenCaixaException from '#exceptions/user_has_no_open_caixa_exception'
import CaixaDoDiaAnteriorFechadaException from '#exceptions/caixa_do_dia_anterior_fechada_exception'
import UserHasAnOpenVendaException from '#exceptions/user_has_an_open_venda_exception'
import venda_itens from '#models/faturacao/venda_itens'
import VendaIsAlreadyOpenOrCloseException from '#exceptions/venda_is_already_open_or_close_exception'
import estoqueRepository from './estoque_repository.js'
import caixaRepository from './caixa_repository.js'
import FechoDiarioRepository from './fecho_diario_repository.js'
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
import Cliente from '#models/cliente'
import Factura from '#models/faturacao/factura'
import FacturaRepository from './factura_repository.js'
import {
  type CondicaoPagamento,
  documentoDaVenda,
  regraDa,
  TIPOS_QUE_TITULAM_A_VENDA,
} from '../helpers/regras_de_emissao.js'
import { PRAZO_PAGAMENTO_PADRAO_DIAS, vencimentoA } from '../helpers/prazo_de_pagamento.js'
import VendaSemClienteIdentificadoException from '#exceptions/venda_sem_cliente_identificado_exception'
import VendaACreditoComPagamentoException from '#exceptions/venda_a_credito_com_pagamento_exception'
import VendaNaoEAdiantamentoException from '#exceptions/venda_nao_e_adiantamento_exception'
import VendaJaEntregueException from '#exceptions/venda_ja_entregue_exception'
import VendaSemDocumentoException from '#exceptions/venda_sem_documento_exception'

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

    // Rede de segurança antes de procurar a caixa: se ficou uma caixa aberta de um dia
    // anterior (o fecho ao fim do dia é um trabalho externo e pode não ter corrido), a
    // venda de hoje ia colar-se a ela e somar aos totais desse dia. Fecha-se aqui, com a
    // anulação das vendas que lá ficaram por concluir — e a venda de hoje passa a exigir
    // uma caixa nova, aberta pelo utilizador.
    const fecho = await new FechoDiarioRepository().fecharCaixasDeDiasAnteriores(user_id!)

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
      // Quem acabou de perder a caixa de ontem para o fecho automático tem de perceber
      // por que ela desapareceu — não é o mesmo caso de quem simplesmente ainda não abriu
      // caixa nenhuma.
      throw fecho.caixasFechadas > 0
        ? new CaixaDoDiaAnteriorFechadaException()
        : new UserHasNoOpenCaixaException()
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
        // Gravada já na abertura para o ecrã poder mostrar, desde o primeiro
        // artigo, que documento vai sair. É no fecho que ela conta, e lá pode ser
        // outra — mas o vendedor não deve ter de esperar pelo fim para saber.
        condicao_pagamento: vendaData.condicao_pagamento ?? 'pronto_pagamento',
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
          condicao_pagamento: vendaData.condicao_pagamento ?? 'pronto_pagamento',
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

  /**
   * Fecha a venda — e emite o documento fiscal que ela titula.
   *
   * ── O que mudou, e porque é que era o problema de fundo ──────────────────────
   *
   * Até aqui, fechar uma venda movia stock, somava a caixa e acabava aí. O
   * documento fiscal era um SEGUNDO acto, noutro ecrã, feito à mão por quem se
   * lembrasse — e quem se lembrasse tinha ainda de escolher entre quatro tipos sem
   * critério nenhum que os separasse. O resultado previsível está registado nas
   * regras de emissão: uma venda de 20.000 Kz com oito documentos a titulá-la, e
   * (o caso silencioso, e pior) vendas sem documento nenhum.
   *
   * Passa a ser um acto só. O tipo não se escolhe: sai de `documentoDaVenda()`, a
   * partir da condição de pagamento e de haver ou não NIF. E é emitido DENTRO da
   * transacção do fecho — ou as duas coisas ficam gravadas, ou nenhuma fica. Entre
   * elas não pode haver uma janela em que o stock saiu e o documento não existe.
   *
   * ── As três condições, e o que cada uma faz aqui ─────────────────────────────
   *
   *     pronto pagamento   exige o dinheiro    stock sai    FR (com NIF) ou FT genérica
   *     crédito            recusa dinheiro     stock sai    Factura, com vencimento
   *     adiantamento       exige o dinheiro    stock FICA   Factura de Adiantamento
   *
   * A linha do meio é a que obrigou a rever o modelo: uma venda que fecha sem
   * pagamento contradiz a regra que este repositório impõe desde a §7.4. Não é uma
   * excepção à regra — é a mesma regra a perguntar primeiro o que a venda é.
   */
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

    /*
     * A condição vale por esta ordem: a do pedido de fecho, a que ficou gravada na
     * abertura da venda, e `pronto_pagamento`. A do fecho ganha porque é a última
     * coisa que alguém disse — quem abriu a venda como pronto pagamento e no fim
     * combinou prazo com o cliente não tem de voltar atrás e refazer a venda.
     */
    const condicao: CondicaoPagamento =
      data.condicao_pagamento ?? venda.condicao_pagamento ?? 'pronto_pagamento'
    const regra = regraDa(condicao)

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

    const totalAPagar = Number((total - valorDesconto).toFixed(2))

    /*
     * Quem é o adquirente — e é o NIF, não o nome, que decide o documento.
     *
     * Um cliente registado sem NIF continua sem identificação fiscal: a venda a
     * pronto pagamento dá-lhe uma factura genérica (o nome fica na venda, o
     * documento diz o que a lei manda dizer), e a crédito ou por adiantamento é
     * recusada — não se cobra a prazo a quem não se identificou, e não se aceita
     * dinheiro por uma entrega futura sem saber a quem entregar.
     */
    const cliente = venda.cliente_presencial_id
      ? await Cliente.find(venda.cliente_presencial_id)
      : null
    const nif = cliente?.nif?.trim() || null

    if (regra.exigeNif && !nif) {
      throw new VendaSemClienteIdentificadoException()
    }

    const pagamentos = await vendapagamento
      .query()
      .where('venda_id', venda.id)
      .whereNull('deleted_at')

    if (regra.exigePagamento) {
      // Uma venda a pronto pagamento nunca pode fechar sem se saber como foi paga: pelo
      // menos um método de pagamento com o respectivo valor, e a soma tem de bater certo
      // com o total (menos desconto) — nem a menos (pagamento incompleto) nem a mais
      // (valor a mais não reclamado por nenhum método).
      if (pagamentos.length === 0) {
        throw new VendaSemPagamentoException()
      }

      const totalPago = Number(
        pagamentos.reduce((soma, pagamento) => soma + Number(pagamento.valor), 0).toFixed(2)
      )

      if (Math.abs(totalPago - totalAPagar) > 0.01) {
        throw new VendaPagamentoIncompletoException(totalAPagar, totalPago)
      }
    } else if (pagamentos.length > 0) {
      /*
       * A crédito é «não recebe nada agora». Um pagamento registado aqui daria uma
       * factura pelo total a conviver com dinheiro já em caixa, e o mapa de
       * cobranças passaria a reclamar valor que já entrou. Quem recebe uma parte no
       * acto faz outra coisa: um adiantamento pelo que recebeu.
       */
      throw new VendaACreditoComPagamentoException()
    }

    /*
     * O prazo, só a crédito. Do pedido se vier, senão o da empresa, senão o padrão —
     * e é CONGELADO na venda: mudar a política da empresa amanhã não pode alterar a
     * data de vencimento de uma factura emitida hoje.
     *
     * O tecto legal é imposto no validator, não aqui: recusar com 400 e uma mensagem
     * por campo é o que a regra 7.20 manda, e este caminho também é usado por quem
     * chame o repositório directamente com um valor já validado.
     */
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias ?? '')
    const prazoDias =
      condicao === 'credito'
        ? (data.prazo_pagamento_dias ??
          venda.prazo_pagamento_dias ??
          empresa.prazo_pagamento_dias ??
          PRAZO_PAGAMENTO_PADRAO_DIAS)
        : null

    // Todas as movimentações de stock, a atualização da venda e a EMISSÃO DO DOCUMENTO
    // correm na mesma transação: se uma falhar a meio (ex.: stock insuficiente num item),
    // nada fica gravado a metade — e nunca fica uma venda fechada sem documento fiscal.
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

      /*
       * O stock só sai se houve entrega.
       *
       * No adiantamento não houve: recebeu-se por um produto que continua no
       * armazém. Dar baixa aqui afirmaria uma saída que não aconteceu, e o sistema
       * passaria a contar menos unidades do que as que lá estão fisicamente. A saída
       * fica para `entregar()`.
       */
      if (regra.saiStock) {
        for (const item of VendaItens) {
          await estoqueRepo.create({
            pos_id: pos.id,
            registrado_por: data.user_id,
            motivo: 'venda',
            tipo_movimentacao: 'saida',
            quantidade: item.quantidade ?? 0,
            lote_produto_id: item.lote_produto_id,
            company_alias: data.company_alias,
          }, trx)
        }
      }

      venda.total = total - valorDesconto
      venda.valor_desconto = valorDesconto
      venda.cupom_id = cupomId
      venda.status = 'fechada'
      venda.condicao_pagamento = condicao
      venda.prazo_pagamento_dias = prazoDias
      venda.useTransaction(trx)
      await venda.save()

      /*
       * O DOCUMENTO FISCAL, na mesma transacção e depois de a venda estar gravada —
       * `emitir()` relê a venda pelo `trx` e exige-a fechada.
       *
       * A venda é gravada primeiro por essa razão e não por outra: se o documento
       * fosse emitido antes, veria a venda ainda 'aberta' e recusaria com
       * `VendaNaoFechada` um fecho que está a correr bem.
       */
      const tipo = documentoDaVenda({ condicao, temNif: Boolean(nif) })

      const documento = await new FacturaRepository().emitir(
        {
          company_alias: data.company_alias ?? '',
          tipo,
          venda_id: venda.id,
          // Quem fecha a venda é quem emite o documento dela.
          emitido_por_user_id: data.user_id ?? null,
          data_vencimento: prazoDias ? vencimentoA(prazoDias).toJSDate() : undefined,
        },
        trx
      )

      // Uma venda efectivada entra na conta da caixa — total_vendas/total_caixa têm de
      // reflectir isso de imediato, não só no fecho da caixa. (A venda a crédito entra em
      // total_vendas e NÃO em total_caixa — ver `recalcularTotais`.)
      await caixaRepo.recalcularTotais(venda.caixa_id!, trx)

      /*
       * O documento vai junto com a venda, em `$extras`.
       *
       * Quem fecha a venda precisa dele imediatamente — é o que se imprime e o que se
       * mostra no ecrã de sucesso. Sem isto, o ponto de venda teria de ir procurá-lo
       * num segundo pedido, adivinhando por que critério; e enquanto adivinhasse, o
       * utilizador estaria a olhar para uma venda concluída sem saber que documento
       * saiu.
       */
      venda.$extras.documento = documento.serialize()
      ;(venda as any).serializeExtras = () => venda.$extras

      return venda
    })
  }

  /**
   * Entregar o produto de uma venda por adiantamento.
   *
   * ── O passo que fecha o ciclo do adiantamento ────────────────────────────────
   *
   * O adiantamento é a única condição em que o dinheiro entra antes da entrega. No
   * fecho, portanto, o stock não saiu e a venda não foi titulada — só foi emitida a
   * factura de adiantamento, que titula o RECEBIMENTO. Fica pendente exactamente
   * uma coisa: a entrega.
   *
   * É este método que a regista, e faz as três coisas que faltavam: dá baixa no
   * armazém, marca a venda como entregue (é a partir daqui que ela conta como
   * receita — ver `relatorios_repository.ts`), e emite o documento que a titula.
   *
   * ⚠️ **A dedução do adiantamento no documento final é feita por observação, não
   * por linha.** `factura` não tem tabela de linhas de artigo, portanto não há onde
   * lançar o abatimento do sinal como a AGT o modela. O documento final sai pelo
   * total e refere a factura de adiantamento nas observações. Quando as linhas
   * existirem, é aqui que a dedução passa a ser feita.
   */
  async entregar(data: VendaEntregarDTO) {
    const venda = await this.findOrFail({ id: data.id, company_alias: data.company_alias })

    if (venda.condicao_pagamento !== 'adiantamento') {
      throw new VendaNaoEAdiantamentoException()
    }

    if (venda.entregue_em) {
      throw new VendaJaEntregueException()
    }

    if (venda.status !== 'fechada') {
      throw new VendaIsAlreadyOpenOrCloseException()
    }

    const itens = await venda_itens.query().where('venda_id', venda.id).select('venda_itens.*')

    const caixaRepo = new caixaRepository()
    const caixa = await caixaRepo.findOrFail(venda.caixa_id!, data.company_alias)

    const posRepo = new posRepository()
    const pos = await posRepo.findOrFail(caixa.pos_id, data.company_alias)

    const estoqueRepo = new estoqueRepository()

    /*
     * A factura de adiantamento que esta venda já tem — vai ser referida no
     * documento final. Sem ela, o documento final seria indistinguível de uma venda
     * a pronto pagamento e ninguém saberia que o dinheiro tinha entrado antes.
     */
    const adiantamento = await Factura.query()
      .where('venda_id', venda.id)
      .where('tipo', 'Factura de Adiantamento')
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .first()

    const cliente = venda.cliente_presencial_id
      ? await Cliente.find(venda.cliente_presencial_id)
      : null

    return db.transaction(async (trx) => {
      for (const item of itens) {
        await estoqueRepo.create({
          pos_id: pos.id,
          registrado_por: data.user_id,
          motivo: 'entrega de adiantamento',
          tipo_movimentacao: 'saida',
          quantidade: item.quantidade ?? 0,
          lote_produto_id: item.lote_produto_id,
          company_alias: data.company_alias,
        }, trx)
      }

      venda.entregue_em = DateTime.now()
      venda.useTransaction(trx)
      await venda.save()

      const facturaRepo = new FacturaRepository()

      /*
       * ── 1. A NOTA DE CRÉDITO sobre a factura de adiantamento ─────────────────
       *
       * A entrega produzia só a factura final, e a factura de adiantamento ficava
       * de pé ao lado dela. Uma venda de 100 Kz saía com DOIS documentos de 100 Kz
       * — o adiantamento e a factura — e o cliente ficava com dois papéis a dizer,
       * cada um, o valor todo. Somados, a operação valia o dobro.
       *
       * Não se via nas contas por acidente de arquitectura: os relatórios contam
       * por VENDA (uma linha) e não por documento. Numa exportação para a AGT, que
       * lê documentos, contaria.
       *
       * ── Porquê anular e refacturar, e não deduzir ────────────────────────────
       *
       * A alternativa era a factura final sair com uma linha de dedução do
       * adiantamento e base tributável zero. O Decreto Presidencial 71/25 não
       * decide entre as duas: define a factura de adiantamento (art.º 3.º g), como
       * comprovativo de pagamento «referente a uma operação futura») e obriga a
       * emiti-la (art.º 4.º n.º 1), mas não diz nada sobre o que se emite na
       * entrega nem sobre dedução. Anular e refacturar é o padrão descrito para
       * Angola pela prática fiscal, e usa só tipos que a AGT lista.
       *
       * Vai ANTES da factura: a nota fecha o adiantamento, e é sobre o terreno
       * livre que a operação é titulada pelo valor inteiro.
       */
      let notaDoAdiantamento: Awaited<ReturnType<FacturaRepository['emitir']>> | null = null

      if (adiantamento) {
        notaDoAdiantamento = await facturaRepo.emitir(
          {
            company_alias: data.company_alias ?? '',
            tipo: 'Nota de Crédito',
            documento_origem_id: adiantamento.id,
            total: Number(adiantamento.total),
            emitido_por_user_id: data.user_id ?? null,
            observacoes: `Anula o adiantamento ${adiantamento.referencia ?? ''} — a operação passa a ser titulada pela factura da entrega.`.trim(),
          },
          trx
        )
      }

      /*
       * ── 2. O documento que TITULA a operação ─────────────────────────────────
       *
       * O dinheiro já entrou, portanto é uma factura-recibo — e o adiantamento
       * exige NIF, por isso nunca cai na genérica.
       */
      const documento = await facturaRepo.emitir(
        {
          company_alias: data.company_alias ?? '',
          tipo: documentoDaVenda({ condicao: 'pronto_pagamento', temNif: Boolean(cliente?.nif) }),
          venda_id: venda.id,
          // Quem entrega a mercadoria é quem emite o documento da entrega.
          emitido_por_user_id: data.user_id ?? null,
          observacoes: adiantamento?.referencia
            ? `Recebida por adiantamento em ${adiantamento.referencia}, anulado por ${notaDoAdiantamento?.referencia ?? 'nota de crédito'}.`
            : undefined,
        },
        trx
      )

      venda.$extras.documento = documento.serialize()
      ;(venda as any).serializeExtras = () => venda.$extras

      return venda
    })
  }

  /**
   * Ajustar uma venda fechada PARA CIMA — emite uma nota de débito.
   *
   * ── Porque é que a venda não é reescrita ─────────────────────────────────────
   *
   * Porque já há um documento fiscal a dizer quanto ela valia. Alterar
   * `vendas.total` deixaria esse documento a contradizer a venda que o originou, e
   * um documento fiscal emitido não se reescreve — nem sequer para corrigir um erro.
   * O que a lei tem para isto é a nota de débito, e é ela que passa a existir: a
   * venda fica como está, e o acréscimo vive num documento que diz o que rectifica
   * e porquê.
   *
   * O simétrico — ajustar para menos — é o reembolso, e emite nota de crédito (ver
   * `produtos_reembolso_repository`).
   */
  async ajustar(data: VendaAjustarDTO) {
    const venda = await this.findOrFail({ id: data.id, company_alias: data.company_alias })

    if (venda.status !== 'fechada') {
      throw new VendaIsAlreadyOpenOrCloseException()
    }

    /*
     * O documento que titula a venda — é ele que a nota rectifica. Uma venda por
     * titular não tem o que corrigir, e a AGT recusa uma nota sem referência à
     * origem (E13).
     */
    const documento = await Factura.query()
      .where('venda_id', venda.id)
      .whereIn('tipo', [...TIPOS_QUE_TITULAM_A_VENDA])
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .first()

    if (!documento) {
      throw new VendaSemDocumentoException()
    }

    return new FacturaRepository().emitir({
      company_alias: data.company_alias ?? '',
      tipo: 'Nota de Débito',
      documento_origem_id: documento.id,
      total: data.valor,
      // Quem ajusta a venda para cima é quem assina a nota de débito.
      emitido_por_user_id: data.user_id ?? null,
      observacoes: data.motivo,
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