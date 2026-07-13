import { MultipartFile } from '@adonisjs/core/bodyparser'

export interface CreateEmpresaUserDTO {
  // USER
  user_username: string
  user_email: string
  user_password: string

  // DADOS PESSOAIS
  dados_nome: string
  dados_sobrenome: string
  dados_foto?: MultipartFile

  // EMPRESA
  empresa_nome: string
  empresa_nif: string
  empresa_user_id?: string
  empresa_tamanho?: 'pequena' | 'media' | 'grande'

  empresa_company_alias: string
  empresa_localizacao?: string
  empresa_contacto: string

  empresa_regime_iva?: boolean
  empresa_status?: boolean
  empresa_inadiplente?: boolean
  empresa_verified?: boolean
}
