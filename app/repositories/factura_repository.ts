import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Factura from '#models/faturacao/factura'
import Vendas from '#models/faturacao/vendas'
import Cliente from '#models/cliente'
import Empresa from '#models/empresa'
import { AnularFacturaDTO, EmitirFacturaDTO, FacturaQueryDTO, ShowFacturaDTO } from '#dtos/factura_dto'
import VendaNaoFechadaException from '#exceptions/venda_nao_fechada_exception'
import FacturaJaAnuladaException from '#exceptions/factura_ja_anulada_exception'

export default class FacturaRepository {
  baseQuery() {
    return Factura.query()
      .join('empresa', 'empresa.id', 'factura.empresa_id')
      .select(
        'factura.*',
        'empresa.nome as empresa_nome',
        'empresa.nif as empresa_nif',
        'empresa.localizacao as empresa_localizacao',
        'empresa.contacto as empresa_contacto'
      )
  }

  async paginate(data: FacturaQueryDTO) {
    let query = this.baseQuery().where('empresa.company_alias', data.company_alias)

    if (data.deleted === 'deleted') {
      query = query.whereNotNull('factura.deleted_at')
    } else if (data.deleted === 'all') {
      // sem filtro
    } else {
      query = query.whereNull('factura.deleted_at')
    }

    if (data.venda_id) {
      query = query.where('factura.venda_id', data.venda_id)
    }

    return query.orderBy('factura.numero', 'desc').paginate(data.page ?? 1, data.limit ?? 20)
  }

  async findOrFail(data: ShowFacturaDTO) {
    return this.baseQuery()
      .where('empresa.company_alias', data.company_alias)
      .where('factura.id', data.id)
      .firstOrFail()
  }

  /**
   * Emite uma factura para uma venda fechada, com numeração sequencial por empresa (nunca
   * global). O lock é feito na própria linha da empresa (não há uma tabela de contador
   * dedicada) — duas emissões concorrentes para a MESMA empresa serializam-se aqui; empresas
   * diferentes nunca se bloqueiam uma à outra. Mesmo padrão já usado para a race condition de
   * stock em estoque_repository.ts.
   */
  async emitir(data: EmitirFacturaDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)

    const venda = await Vendas.query()
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .where('pos.empresa_id', empresa.id)
      .where('vendas.id', data.venda_id)
      .select('vendas.*')
      .firstOrFail()

    if (venda.status !== 'fechada') {
      throw new VendaNaoFechadaException()
    }

    let clienteNome: string | null = null
    let clienteNif: string | null = null
    if (venda.cliente_presencial_id) {
      const cliente = await Cliente.find(venda.cliente_presencial_id)
      clienteNome = cliente?.nome ?? null
      clienteNif = cliente?.nif ?? null
    }

    return db.transaction(async (trx) => {
      await Empresa.query({ client: trx }).where('id', empresa.id).forUpdate().firstOrFail()

      const ultima = await Factura.query({ client: trx })
        .where('empresa_id', empresa.id)
        .orderBy('numero', 'desc')
        .first()
      const proximoNumero = (ultima?.numero ?? 0) + 1

      return Factura.create(
        {
          empresa_id: empresa.id,
          venda_id: venda.id,
          numero: proximoNumero,
          tipo: data.tipo,
          status: 'emitida',
          cliente_nome: clienteNome,
          cliente_nif: clienteNif,
          total: venda.total,
          data_emissao: DateTime.now(),
          observacoes: data.observacoes ?? null,
        },
        { client: trx }
      )
    })
  }

  async anular(data: AnularFacturaDTO) {
    const factura = await this.findOrFail(data)
    if (factura.status === 'anulada') {
      throw new FacturaJaAnuladaException()
    }
    factura.status = 'anulada'
    await factura.save()
    return factura
  }
}
