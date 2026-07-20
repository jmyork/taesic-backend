import { DateTime } from 'luxon'
import produtos from '#models/faturacao/produtos'
import {
  CreateProdutoDetalhesDTO,
  CreateprodutosDTO,
  ProdutoQueryDTO,
  UpdateprodutosDTO,
} from '#dtos/produtos_dto'
import db from '@adonisjs/lucid/services/db'
import categorias_produtos from '#models/faturacao/categorias_produtos'
import Empresa from '#models/empresa'
import loteRepository from './lote_repository.js'
import estoqueRepository from './estoque_repository.js'
import venda_itensRepository from './venda_itens_repository.js'
import NotAllowedChangeIsServiceTagException from '#exceptions/not_allowed_change_is_service_tag_exception'
import ProdutoComMovimentacoesException from '#exceptions/produto_com_movimentacoes_exception'

export default class produtosRepository {
  baseQuery() {
    return produtos.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produtos.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produtos.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produtos.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produtos.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where('produtos.created_at', '<=', new Date(filter.createdDtEnd).toISOString())
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produtos.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produtos.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where('produtos.updated_at', '<=', new Date(filter.updatedDtEnd).toISOString())
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('produtos.nome', 'like', `%${filter.nome}%`)
    }

    // marca_id filter (era duplicado — o mesmo bloco corria duas vezes)
    if (filter?.marca_id) {
      query = query.where('produtos.marca_id', filter.marca_id)
    }
    // formato_id filter
    if (filter?.formato_id) {
      query = query.where('produtos.formato_id', filter.formato_id)
    }
    // fabricante_id filter
    if (filter?.fabricante_id) {
      query = query.where('produtos.fabricante_id', filter.fabricante_id)
    }
    // fornecedor_id filter
    if (filter?.fornecedor_id) {
      query = query.where('produtos.fornecedor_id', filter.fornecedor_id)
    }
    // is_service filter — coluna booleana; "like" nunca combinava porque o MySQL guarda
    // 0/1, não as strings "true"/"false" — este filtro nunca funcionou.
    if (filter?.is_service !== undefined) {
      query = query.where('produtos.is_service', filter.is_service)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('produtos.empresa_id', filter.empresa_id)
    }

    return await query.select('produtos.*').orderBy('created_at', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    // //console.log(reaching query)
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produtos.id', id)
      .select(['produtos.*'])
      .firstOrFail()
  }

  async create(data: CreateprodutosDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)

    const { empresa_id, company_alias, user_id, preco_venda, preco_compra, ...produtoData } = data
    // Se for serviço, remove campos que não fazem sentido

    if (produtoData.is_service) {
      const { formato_id, fornecedor_id, marca_id, fabricante_id, ...servicoData } = produtoData
      const produto = await produtos.create({
        ...servicoData,
        empresa_id: empresa.id,
      })

      // registrar no stock e registrar o lote.
      // registrar o lote com o preço de venda e de compra do serviço, para que seja possível ter um histórico de preços e também para o caso de o serviço ter um custo associado (ex: um serviço de manutenção pode ter um custo de peças e mão de obra).
      const loteRepo = new loteRepository()
      await loteRepo.create({
        produto_id: produto.id,
        user_id: data.user_id!,
        preco_venda: data.preco_venda!,
        preco_compra: data.preco_compra ?? 0,
        quantidade_em_estoque: 0, // serviços não têm estoque, mas para manter a consistência do modelo, podemos criar um lote com quantidade zero

        company_alias: data.company_alias!,
      })

      return produto
    }

    return await produtos.create({
      ...produtoData,
      empresa_id: empresa.id,
    })
  }

  async update(id: string, data: UpdateprodutosDTO, company_alias?: string) {
    const produto = await this.findOrFail(id, company_alias)

    // verifica se será serviço após update
    // const isService = data.is_service ?? produto.is_service

    if (produto.is_service) {
      const { formato_id, fornecedor_id, marca_id, fabricante_id, preco_venda, preco_compra, user_id, ...servicoData } = data

      // consultar se existe movimentações de estoque ou vendas associadas ao produto, caso exista, não permitir a atualização do produto para um serviço, pois isso pode causar inconsistências nos dados.
      const estoqueRepo = new estoqueRepository()
      const movimentacoesEstoque = await estoqueRepo.paginate(1, 2, { produto_id: produto.id, company_alias })

      if (movimentacoesEstoque.all.length > 2) {
        throw new ProdutoComMovimentacoesException()
      }

      // actualizar o lote do produto para atualizar os preços de venda e compra do serviço, caso eles tenham sido alterados, para manter o histórico de preços atualizado e também para o caso de o serviço ter um custo associado (ex: um serviço de manutenção pode ter um custo de peças e mão de obra).
      const loteRepo = new loteRepository()
      const lote = (await loteRepo.paginate(1, 1, { produto_id: produto.id, company_alias }))[0]
      lote.preco_venda = preco_venda ?? lote.preco_venda
      lote.preco_compra = preco_compra ?? lote.preco_compra
      await lote.save()

      const vendaItensRepo = new venda_itensRepository()
      const itensVenda = await vendaItensRepo.baseQuery()
        .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
        .where('lote_produto.produto_id', produto.id)
        .first()

      if (itensVenda) {
        throw new NotAllowedChangeIsServiceTagException()
      }

      produto.merge(servicoData)
    } else {
      produto.merge(data)
    }

    await produto.save()

    return produto
  }

  async softDelete(id: string, company_alias?: string) {
    const produtos = await this.baseQuery()
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produtos.id', id)
      .select('produtos.*')
      .firstOrFail()
    produtos.deletedAt = produtos.deletedAt ? null : DateTime.now()
    await produtos.save()
  }

  async registrarProdutoAndDetalhes(data: CreateProdutoDetalhesDTO) {
    // `data.produto` vem do validator sem `empresa_id` (só tem `company_alias`, que a
    // tabela `produtos` não tem) — sem esta resolução, o INSERT ia com `empresa_id`
    // undefined, quebrando o isolamento por tenant deste produto.
    const empresa = await Empresa.findByOrFail('company_alias', data.produto.company_alias)
    const { company_alias, user_id, ...produtoData } = data.produto

    const trx = await db.transaction()
    try {
      const produto = await produtos.create({ ...produtoData, empresa_id: empresa.id }, { client: trx })

      if (data.detalhes?.descricoes && data.detalhes.descricoes.length > 0) {
        await produto.related('descricoes').createMany(data.detalhes.descricoes, { client: trx })
      }

      if (data.detalhes?.categorias && data.detalhes.categorias.length > 0) {
        const categorias: { produto_id: string; produto_categoria_id: string }[] = []
        data.detalhes.categorias.forEach((currentCategoria) => {
          categorias.push({
            produto_id: produto.id,
            produto_categoria_id: currentCategoria.produto_categoria_id,
          })
        })
        await categorias_produtos.createMany(categorias, { client: trx })
      }

      if (data.detalhes?.contraindicacoes && data.detalhes.contraindicacoes.length > 0) {
        await produto
          .related('contraindicacoes')
          .createMany(data.detalhes.contraindicacoes, { client: trx })
      }

      if (data.detalhes?.recomendacoes && data.detalhes.recomendacoes.length > 0) {
        await produto
          .related('recomendacoes')
          .createMany(data.detalhes.recomendacoes, { client: trx })
      }

      await trx.commit()
      return produto
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }
}
