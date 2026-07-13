import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoContraIndicacaoQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  contraindicacao?: string
  produto_id?: string
  company_alias?: string
  empresa_id?: string
}
export interface Createproduto_contraindicacoesDTO {
  enabled?: boolean
  contraindicacao: string
  produto_id: string
  company_alias?: string
  empresa_id?: string
}
export interface Updateproduto_contraindicacoesDTO {
  enabled?: boolean
  contraindicacao?: string
  produto_id?: string
}
