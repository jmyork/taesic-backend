import produtos_reembolso from '#models/faturacao/produtos_reembolso'
import {
  ShowProdutosReembolsoDTO,
  ProdutosReembolsoQueryDTO,
  ReembolsoParcialDTO,
  ReembolsoTotalDTO,
} from '#dtos/produtos_reembolso_dto'
import venda_itensRepository from './venda_itens_repository.js'
import QuantidadeReembolsoExcedeVendidaException from '#exceptions/quantidade_reembolso_excede_vendida_exception'
import UnAuthorizedReembolsoException from '#exceptions/un_authorized_reembolso_exception'
import estoqueRepository from './estoque_repository.js'
import vendasRepository from './vendas_repository.js'
import posRepository from './pos_repository.js'
import caixaRepository from './caixa_repository.js'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Lote from '#models/faturacao/lote'
import cupom from '#models/cupom'
import emitter from '@adonisjs/core/services/emitter'
import EstoqueRevertido from '#events/estoque_revertido'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Factura from '#models/faturacao/factura'
import FacturaRepository from './factura_repository.js'
import { TIPOS_QUE_TITULAM_A_VENDA, stockJaSaiu } from '../helpers/regras_de_emissao.js'
import VendaSemDocumentoException from '#exceptions/venda_sem_documento_exception'

const REEMBOLSO_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'range', column: 'produtos_reembolso.quantidade', startKey: 'quantidade_start', endKey: 'quantidade_end', exactKey: 'quantidade' },
  { kind: 'exact', column: 'produtos_reembolso.user_id', key: 'user_id' },
  { kind: 'exact', column: 'produtos_reembolso.venda_item_id', key: 'venda_item_id' },
]

export default class produtos_reembolsoRepository {

  baseQuery() {
    return produtos_reembolso.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutosReembolsoQueryDTO) {
    let query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'produtos_reembolso',
      fields: REEMBOLSO_FILTER_FIELDS,
    })

    // produtos_reembolso só guarda venda_item_id/user_id/quantidade — sem estes joins o
    // chamador (ecrã de histórico de reembolsos) só teria ids em bruto para mostrar.
    query = query
      .join('venda_itens', "venda_itens.id", "produtos_reembolso.venda_item_id")
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('user', 'user.id', 'produtos_reembolso.user_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')

    // empresa filters
    if (filter?.company_alias) {
      query = query.where('empresa.company_alias', filter.company_alias)
    }

    // NOTA: filtro por `produtos_reembolso.empresa_id` foi removido — essa coluna não existe
    // nesta tabela (o isolamento de tenant é feito via `company_alias`, acima, através do
    // join até `empresa`). Filtrar por uma coluna inexistente resultava sempre em erro 500.

    const paginator = await query
      .select(
        'produtos_reembolso.*',
        'vendas.id as venda_id',
        'vendas.numero as venda_numero',
        'produtos.nome as produto_nome',
        'user.username as operador_nome',
        'venda_itens.preco_unitario as preco_unitario'
      )
      .orderBy('produtos_reembolso.created_at', 'desc')
      .paginate(page, limit)

    // Colunas extra vindas de join ("as X") ficam em $extras — sem isto o Lucid não as
    // serializa para JSON (mesmo padrão documentado no catálogo de produtos).
    for (const reembolso of paginator.all()) {
      (reembolso as any).serializeExtras = () => reembolso.$extras
    }

    return paginator
  }

  /** Lista todos os reembolsos (totais e parciais) associados a uma venda. */
  async listByVenda(data: ShowProdutosReembolsoDTO) {
    return await this.baseQuery()
      .join("venda_itens", "venda_itens.id", "produtos_reembolso.venda_item_id")
      .join("vendas", "vendas.id", "venda_itens.venda_id")
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', data.company_alias ?? '')
      .where('vendas.id', data.venda_id)
      .select(['produtos_reembolso.*'])
  }

  async reembolsar_total(data: ReembolsoTotalDTO) {
    // obter os itens da venda
    const vendaItemRepo = new venda_itensRepository()

    const venda_itens = await vendaItemRepo.paginate(1, 1000, { venda_id: data.venda_id, company_alias: data.company_alias })
    // obter a venda para pegar o caixa_id para pegar o pos_id para a movimentação do estoque
    const vendaRepo = new vendasRepository()
    const venda = await vendaRepo.findOrFail({ id: venda_itens[0].venda_id, company_alias: data.company_alias })
    const caixaRepo = new caixaRepository()
    const caixa = await caixaRepo.findOrFail(venda.caixa_id!, data.company_alias)

    // Vendedor/Estoquista só podem reembolsar as suas próprias vendas — nunca as de
    // outro vendedor (Admin/Gerente/Supervisor continuam sem esta restrição).
    if (data.restrito && caixa.user_id !== data.user_id) {
      throw new UnAuthorizedReembolsoException()
    }

    const posRepo = new posRepository()
    const pos = await posRepo.findOrFail(caixa.pos_id, data.company_alias)
    // registrar movimentação do stock
    const estoqueRepo = new estoqueRepository()

    // Movimentações de stock, criação dos registos de reembolso e atualização da venda correm
    // todas na mesma transação — um item a falhar a meio não pode deixar reembolsos parciais
    // gravados sem a devolução de stock correspondente (ou vice-versa).
    /*
     * O stock só volta se chegou a SAIR.
     *
     * Uma venda por adiantamento ainda não entregue nunca deu baixa no armazém —
     * o produto continua fisicamente lá. Devolvê-lo ao stock aqui criaria
     * mercadoria do nada: o sistema passaria a contar mais unidades do que as que
     * existem, e o inventário deixaria de bater à primeira contagem física.
     *
     * A pergunta vive em `stockJaSaiu()`, ao lado da regra que a origina, e é a
     * mesma que decide se houve receita a reconhecer. Não é coincidência: o custo
     * da mercadoria acompanha a saída dela.
     */
    const devolverStock = stockJaSaiu(venda)

    const reembolsosCriados = await db.transaction(async (trx) => {
      if (devolverStock) {
        for (const item of venda_itens) {
          await estoqueRepo.create({
            pos_id: pos.id,
            registrado_por: data.user_id,
            motivo: `Reajuste por reembolso total - venda_id: ${venda.id}`,
            tipo_movimentacao: 'entrada',
            quantidade: item.quantidade,
            lote_produto_id: item.lote_produto_id,
            company_alias: data.company_alias,
          }, trx)
        }
      }

      // criar os registros de reembolso
      const criados = []
      for (const item of venda_itens) {
        const reembolsoCriado = await produtos_reembolso.create({
          venda_item_id: item.id,
          user_id: data.user_id ?? '',
          quantidade: item.quantidade,
        }, { client: trx })

        item.deletedAt = DateTime.now()
        item.useTransaction(trx)
        await item.save()
        criados.push(reembolsoCriado)
      }

      /*
       * A NOTA DE CRÉDITO, pelo valor que estava a ser devolvido — lido ANTES de a
       * venda ser zerada, que é a única altura em que ele ainda existe.
       */
      await this.emitirNotaDeCredito(
        venda.id,
        Number(venda.total),
        venda.motivo_reembolso ?? 'Reembolso total da venda.',
        data.company_alias,
        trx,
        data.user_id
      )

      // um reembolso total esvazia a venda por completo — refletir isso no registo da venda,
      // que anteriormente continuava a mostrar-se "fechada" com o total original.
      venda.status = 'reembolsada'
      venda.total = 0
      // Sem venda não há desconto: deixar o `valor_desconto` antigo fazia a factura
      // mostrar um desconto sobre um total zero.
      venda.valor_desconto = 0
      venda.useTransaction(trx)
      await venda.save()

      // total_vendas/total_caixa da caixa têm de deixar de contar este valor agora reembolsado.
      await caixaRepo.recalcularTotais(caixa.id, trx)

      return criados
    })

    // Só depois da transação confirmar — nunca alerta sobre uma reversão que possa ainda
    // vir a ser desfeita. E só se houve mesmo reversão: um adiantamento por entregar
    // não devolveu nada ao armazém, e um alerta sobre isso mandaria alguém procurar
    // um movimento que não existe.
    for (const item of devolverStock ? venda_itens : []) {
      await this.avisarEstoqueRevertido(
        item.lote_produto_id,
        item.quantidade,
        `Reembolso total da venda ${venda.id}`,
        data.company_alias
      )
    }

    return reembolsosCriados
  }

  /**
   * A NOTA DE CRÉDITO de um reembolso.
   *
   * ── Porque é que um reembolso tem de emitir um documento ─────────────────────
   *
   * Devolver dinheiro reduz o valor de uma operação já declarada às Finanças. O
   * documento que a lei tem para isso é a nota de crédito, e sem ela o reembolso
   * existe só aqui dentro: o stock volta, a caixa desce, e o que foi declarado
   * continua a dizer o valor cheio. É o ponto 6 do pedido.
   *
   * Corre na MESMA transacção do reembolso — um reembolso gravado sem a nota seria
   * exactamente o estado que se está a corrigir, só que criado por nós.
   *
   * ── Sem documento de origem, o reembolso NÃO acontece ────────────────────────
   *
   * Recusa com `VendaSemDocumento` (409) em vez de devolver o dinheiro em silêncio.
   *
   * A primeira versão deixava passar, a pensar nas vendas anteriores à emissão
   * automática no fecho. Estava errado, e é o dono do produto que o diz: **um
   * reembolso tem de ter documento**. Devolver dinheiro reduz o valor de uma
   * operação já declarada às Finanças; sem nota de crédito, o stock volta, a caixa
   * desce, e o que foi declarado continua a dizer o valor cheio. O sistema passaria
   * a produzir, ele próprio, a divergência que este trabalho veio corrigir.
   *
   * A objecção («e as vendas antigas por titular?») deixou de existir por
   * construção: toda a venda fechada passa a nascer com o seu documento, e a base
   * é reconstruída de raiz. Se alguma vez aparecer uma venda por titular, o caminho
   * é emitir-lhe a factura primeiro — e a excepção diz exactamente isso.
   */
  private async emitirNotaDeCredito(
    vendaId: string,
    valor: number,
    motivo: string,
    companyAlias: string | undefined,
    trx: TransactionClientContract,
    /**
     * Quem está a reembolsar — vai assinar a nota.
     *
     * Uma nota de crédito não nasce de uma venda (liga-se ao documento que
     * rectifica), portanto o vendedor resolvido por `venda → caixa → user` não a
     * alcança: aparecia sem ninguém identificado. E é o documento que justifica
     * uma saída de dinheiro — precisamente aquele em que saber quem o assinou mais
     * importa.
     */
    emitidoPor: string | undefined
  ) {
    const documento = await Factura.query({ client: trx })
      .where('venda_id', vendaId)
      .whereIn('tipo', [...TIPOS_QUE_TITULAM_A_VENDA])
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .first()

    if (!documento) {
      throw new VendaSemDocumentoException()
    }

    /*
     * Valor zero não produz documento — e não é o mesmo caso.
     *
     * Acontece quando o reembolso não altera o que é devido (um item já
     * inteiramente creditado, um arredondamento). Uma nota de crédito de 0 Kz não
     * rectifica nada e é recusada pela AGT; a verificação vem DEPOIS da do
     * documento precisamente para que a ausência de factura continue a ser um erro
     * e não se esconda atrás dela.
     */
    if (valor <= 0) return null

    return new FacturaRepository().emitir(
      {
        company_alias: companyAlias ?? '',
        tipo: 'Nota de Crédito',
        documento_origem_id: documento.id,
        total: Math.round(valor * 100) / 100,
        emitido_por_user_id: emitidoPor ?? null,
        observacoes: motivo,
      },
      trx
    )
  }

  /** Emite `EstoqueRevertido` quando um reembolso devolve produtos ao stock. */
  private async avisarEstoqueRevertido(loteId: string, quantidade: number, motivo: string, companyAlias?: string) {
    try {
      const lote = await Lote.query().where('lote_produto.id', loteId).preload('produto').first()
      if (!lote) return

      await emitter.emit(
        EstoqueRevertido,
        new EstoqueRevertido(loteId, lote.produto?.nome ?? 'desconhecido', companyAlias ?? '', quantidade, motivo)
      )
    } catch (error) {
      console.error('Falha ao avaliar/emitir alerta de reversão de estoque:', error)
    }
  }

  async reembolsar_parcial(data: ReembolsoParcialDTO) {
    const vendaItemRepo = new venda_itensRepository()
    const venda_item = await vendaItemRepo.findOrFail(data.venda_item_id, data.company_alias)
    // Lógica para reembolso parcial
    // checar a quantidade a remover vs quantidade do item
    if (data.quantidade && data.quantidade > venda_item.quantidade) {
      throw new QuantidadeReembolsoExcedeVendidaException()
    }

    // pegar o caixa para pegar o pos_id para a movimentação do estoque
    const vendaRepo = new vendasRepository()
    const venda = await vendaRepo.findOrFail({ id: venda_item.venda_id, company_alias: data.company_alias })
    const caixaRepo = new caixaRepository()
    const caixa = await caixaRepo.findOrFail(venda.caixa_id!, data.company_alias)

    // Vendedor/Estoquista só podem reembolsar as suas próprias vendas — nunca as de
    // outro vendedor (Admin/Gerente/Supervisor continuam sem esta restrição).
    if (data.restrito && caixa.user_id !== data.user_id) {
      throw new UnAuthorizedReembolsoException()
    }

    const posRepo = new posRepository()
    const pos = await posRepo.findOrFail(caixa.pos_id, data.company_alias)

    const estoqueRepo = new estoqueRepository()

    const devolverStock = stockJaSaiu(venda)

    // A atualização do item, a devolução de stock, o registo do reembolso e o recálculo do
    // total da venda correm todos na mesma transação — caso contrário um erro a meio (ex.:
    // stock insuficiente ao registar a entrada) deixaria o item já reduzido sem o reembolso
    // correspondente ter sido criado.
    return db.transaction(async (trx) => {
      // checar se a diferença entre quantidade vendidas vs a reembolsada é zero. Se for, deletar.
      const quantidadeSobrando = venda_item.quantidade - (data.quantidade ?? 0)
      if (quantidadeSobrando === 0) {
        venda_item.deletedAt = DateTime.now()
      } else {
        venda_item.merge({ quantidade: quantidadeSobrando })
      }
      venda_item.useTransaction(trx)
      await venda_item.save()

      // O stock só volta se chegou a sair — ver `stockJaSaiu()` e a nota do
      // reembolso total. Um adiantamento por entregar não deu baixa nenhuma.
      if (devolverStock) {
        await estoqueRepo.create({
          pos_id: pos.id,
          registrado_por: data.user_id,
          motivo: `Reajuste por reembolso parcial - venda_item_id: ${venda_item.id}`,
          tipo_movimentacao: 'entrada',
          quantidade: data.quantidade ?? 0,
          lote_produto_id: venda_item.lote_produto_id,
          company_alias: data.company_alias,
        }, trx)
      }

      // criar o registro de reembolso
      const reembolsoCriado = await produtos_reembolso.create({
        venda_item_id: data.venda_item_id,
        user_id: data.user_id ?? '',
        quantidade: data.quantidade ?? 0,
      }, { client: trx })

      // recalcular o total da venda a partir dos itens que restam — anteriormente a venda
      // continuava a mostrar o total original mesmo depois de um reembolso parcial reduzir
      // efetivamente o que foi cobrado. A leitura usa a mesma transação para ver a
      // atualização de venda_item feita acima antes de esta ser confirmada (commit).
      const itensRestantes = await vendaItemRepo.paginate(1, 1000, {
        venda_id: venda.id,
        company_alias: data.company_alias,
      }, trx)
      const novoTotal = itensRestantes.reduce(
        (soma, item) => soma + item.preco_unitario * item.quantidade,
        0
      )

      // O total recalculado é BRUTO. Se a venda foi fechada com cupão, o cliente pagou o
      // valor líquido — gravar aqui o bruto fazia a venda saltar para quase o dobro do que
      // foi cobrado (visto em dados reais: 1.714.947,05 pagos passavam a 3.429.632,70
      // depois de devolver 261,40) e inflacionava `caixa.total_vendas`, que soma
      // `vendas.total`. Reaplica-se a MESMA percentagem do cupão ao novo bruto, tal como
      // `vendas_repository.close()` faz no fecho.
      let valorDesconto = 0
      if (venda.cupom_id) {
        const cupomDaVenda = await cupom.find(venda.cupom_id, { client: trx })
        if (cupomDaVenda) {
          valorDesconto = Math.min(
            Number((novoTotal * (cupomDaVenda.desconto / 100)).toFixed(2)),
            novoTotal
          )
        }
      }

      const totalAnterior = Number(venda.total)

      venda.total = Number((novoTotal - valorDesconto).toFixed(2))
      venda.valor_desconto = valorDesconto
      if (itensRestantes.length === 0) {
        venda.status = 'reembolsada'
      }

      /*
       * A NOTA DE CRÉDITO pela DIFERENÇA, e não pelo valor bruto dos artigos
       * devolvidos.
       *
       * São coisas diferentes quando a venda levou cupão: o cliente pagou o líquido,
       * e o desconto é reaplicado ao novo bruto logo acima. Creditar o bruto
       * devolveria, no papel, mais do que ele chegou a pagar — e a nota seria
       * recusada pela verificação de "não se credita mais do que resta da origem",
       * ou passaria e ficaria errada.
       */
      await this.emitirNotaDeCredito(
        venda.id,
        totalAnterior - venda.total,
        `Reembolso parcial: ${data.quantidade ?? 0} unidade(s).`,
        data.company_alias,
        trx,
        data.user_id
      )
      venda.useTransaction(trx)
      await venda.save()

      // total_vendas/total_caixa da caixa têm de reflectir o novo total (reduzido) da venda.
      await caixaRepo.recalcularTotais(caixa.id, trx)

      return reembolsoCriado
    }).then(async (reembolsoCriado) => {
      // Só depois da transação confirmar — nunca alerta sobre uma reversão que possa ainda
      // vir a ser desfeita, e só se houve mesmo reversão.
      if (devolverStock) {
        await this.avisarEstoqueRevertido(
          venda_item.lote_produto_id,
          data.quantidade ?? 0,
          `Reembolso parcial do item ${venda_item.id}`,
          data.company_alias
        )
      }
      return reembolsoCriado
    })
  }

}
