import { Createproduto_descricaoDTO } from './produto_descricao_dto.js'
import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  // campos
  fornecedor_id?: string | undefined
  marca_id?: string | undefined
  formato_id?: string | undefined
  fabricante_id?: string | undefined
  empresa_id?: string | undefined
  descricao?: string
  nome?: string
  is_service?: boolean | undefined
  company_alias?: string
}

export interface CreateprodutosDTO {
  enabled?: boolean | undefined
  fornecedor_id?: string | undefined
  marca_id?: string | undefined
  formato_id?: string | undefined
  fabricante_id?: string | undefined
  empresa_id?: string | undefined
  descricao: string
  nome: string
  is_service: boolean
  company_alias?: string
  // para o caso de ser um serviço
  user_id?: string
  preco_compra?: number
  preco_venda?: number
}

export interface UpdateprodutosDTO {
  enabled?: boolean | undefined
  formato_id?: string | undefined
  fabricante_id?: string | undefined
  marca_id?: string | undefined
  fornecedor_id?: string | undefined
  descricao?: string | undefined
  nome?: string | undefined
  // is_service?: boolean | undefined
  deleted_at?: Date | undefined

  // para o caso de ser um serviço
  // para o caso de ser um serviço
  user_id?: string
  preco_compra?: number
  preco_venda?: number
}

export interface CreateProdutoDetalhesDTO {
  produto: CreateprodutosDTO
  detalhes: {
    descricoes?: Createproduto_descricaoDTO[]
    imagens?: { url: string }[]
    categorias?: { produto_categoria_id: string }[]
    contraindicacoes?: { contraindicacao: string }[]
    recomendacoes?: { recomendacao: string }[]
    fornecedor?: { nome: string; contato: string }
    marca?: { nome: string }
  }
}
