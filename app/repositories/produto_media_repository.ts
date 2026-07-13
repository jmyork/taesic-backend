import produto_media from '#models/faturacao/produto_media'
import {
  Createproduto_mediaDTO,
  ProdutoImagemQueryDTO,
  Updateproduto_mediaDTO,
} from '#dtos/produto_media_dto'
import { DeletedValue } from '../helpers/Types.js'
import Empresa from '#models/empresa'
import { randomUUID } from 'crypto'
import env from '#start/env'
import drive from '@adonisjs/drive/services/main'

export default class produto_mediaRepository {
  baseQuery() {
    return produto_media.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoImagemQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produto_media.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produto_media.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produto_media.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produto_media.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'produto_media.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produto_media.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produto_media.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'produto_media.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.produto_id) {
      query = query.where('produto_media.produto_id', 'like', `%${filter.produto_id}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'produto_media.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'produto_media.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
        .where('empresa.id', filter.empresa_id)
    }

    return await query
      .select('produto_media.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .leftJoin('produtos', 'produtos.id', 'produto_media.produto_id')
      .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_media.id', id)
      .select(['produto_media.*'])
      .firstOrFail()
  }

  async create(data: Createproduto_mediaDTO) {
    await Empresa.findByOrFail('company_alias', data.company_alias)

    const { empresa_id, company_alias, ...produtoImagemData } = data

    const mediaArray = Array.isArray(data.media) ? data.media : [data.media]

    const records = await Promise.all(
      mediaArray.map(async (file) => {
        const fileName = `${randomUUID()}.${file.extname}`
        const imagePath = `images/products/${fileName}`

        await file.moveToDisk(imagePath)

        const imageUrl =
          env.get('NODE_ENV') !== 'development'
            ? `${env.get('R2_ENDPOINT')}/${env.get('R2_BUCKET')}/${imagePath}`
            : `${env.get('R2_DEV_SHOW_ENDPOINT')}/${imagePath}`

        return {
          ...produtoImagemData,
          media: imageUrl,
        }
      })
    )

    return produto_media.createMany(records)
  }

  async update(id: string, data: Updateproduto_mediaDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const produtoImagem = await this.findOrFail(id, company_alias)

    /**
     * Extrair o path da imagem a partir da URL salva
     */
    const imagePath = new URL(produtoImagem.media).pathname
      .replace(`/${env.get('R2_BUCKET')}/`, '')
      .replace(/^\/+/, '')

    /**
     * Apagar do R2
     */
    await drive.use().delete(imagePath)

    /**
     * Soft delete no banco
     */
    await produtoImagem.delete()
  }

  show_product_imagem(id: string, page: number, limit: number, deleted: DeletedValue) {
    let query = this.baseQuery().where('produto_id', id)
    if (deleted === 'deleted') {
      query = query.whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('deleted_at')
    }
    return query
      .preload('produto', (p) => p.select('id', 'nome', 'descricao', 'is_service'))
      .paginate(page, limit)
  }
}
