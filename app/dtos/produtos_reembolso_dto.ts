import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutosReembolsoQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  quantidade_start?: number
  quantidade_end?: number


  quantidade?: number

  user_id?: string
  venda_item_id?: string
  empresa_id?: string
  company_alias?: string
}

export interface Createprodutos_reembolsoDTO {
  enabled?: boolean
  quantidade: number
  user_id: string
  venda_item_id: string
}
export interface Updateprodutos_reembolsoDTO {
  enabled?: boolean
  quantidade?: number
  user_id?: string
  venda_item_id?: string
}

export interface ReembolsoParcialDTO {
  venda_id: string
  venda_item_id: string

  motivo?: string
  company_alias?: string
  empresa_id?: string
  user_id?: string
  quantidade: number
}

export interface ReembolsoTotalDTO {
  venda_id: string
  motivo?: string

  company_alias?: string
  empresa_id?: string
  user_id?: string
}


export interface ShowProdutosReembolsoDTO {
  id: string

  company_alias?: string
  empresa_id?: string
  user_id?: string
}