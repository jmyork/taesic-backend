import produto_mediaRepository from '#repositories/produto_media_repository'
import {
  Createproduto_mediaDTO,
  Updateproduto_mediaDTO,
  ProdutoImagemQueryDTO,
} from '#dtos/produto_media_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class produto_mediaService {
  repo = new produto_mediaRepository()

  list(page?: number, limit?: number, filter?: ProdutoImagemQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_mediaDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_mediaDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }

  show_product_imagem(id: string, page: number, limit: number, deleted: DeletedValue) {
    return this.repo.show_product_imagem(id, page, limit, deleted)
  }
}
