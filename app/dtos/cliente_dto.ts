import type { MultipartFile } from '@adonisjs/core/bodyparser'

/**
 * `logo` e `foto` são o FICHEIRO enviado, não um caminho.
 *
 * Antes eram `string` porque o validador escrevia o ficheiro no disco local e
 * devolvia o nome. Agora o validador só valida, e é
 * `cliente_repository.create()/update()` que sobe para o R2 e grava a URL
 * pública na coluna (que continua a ser `string` no model). Ver
 * app/helpers/imagem_r2.ts.
 */
export interface CreateclienteDTO {
  cliente_pai_id?: string
  foto?: MultipartFile
  logo?: MultipartFile
  observacao?: string
  saldo?: number
  limite_credito?: number
  ativo?: boolean
  codigo_postal?: string
  pais?: string
  provincia?: string
  cidade?: string
  bairro?: string
  endereco?: string
  website?: string
  profissao?: string
  estado_civil?: string
  genero?: string
  data_nascimento?: Date
  numero_registro?: string
  nif?: string
  telefone_secundario?: string
  telefone?: string
  email?: string
  razao_social?: string
  nome_fantasia?: string
  nome?: string
  tipo: string
}
export interface ClienteQueryDTO {
  // Pesquisa livre — procura em nome/nome_fantasia/razao_social/email/telefone/nif ao
  // mesmo tempo (para uma caixa de pesquisa única no frontend).
  q?: string

  // Numeração sequencial por-empresa — nº do registo, distinto do `id` (UUID).
  numero?: number

  // Filtros por campo (correspondência parcial) — para pesquisas mais precisas/combinadas.
  nome?: string
  nome_fantasia?: string
  razao_social?: string
  email?: string
  telefone?: string
  telefone_secundario?: string
  nif?: string
  numero_registro?: string
  cidade?: string
  provincia?: string
  pais?: string

  // Filtros exactos
  tipo?: string
  ativo?: boolean
  cliente_pai_id?: string

  // Datas de auditoria
  createdDtStart?: Date
  createdDtEnd?: Date
  updatedDtStart?: Date
  updatedDtEnd?: Date
  deleted?: 'deleted' | 'all' | null

  empresa_id?: string
  company_alias?: string

  page?: number
  limit?: number
}

export interface UpdateclienteDTO {
  cliente_pai_id?: string
  foto?: MultipartFile
  logo?: MultipartFile
  observacao?: string
  saldo?: number
  limite_credito?: number
  ativo?: boolean
  codigo_postal?: string
  pais?: string
  provincia?: string
  cidade?: string
  bairro?: string
  endereco?: string
  website?: string
  profissao?: string
  estado_civil?: string
  genero?: string
  data_nascimento?: Date
  numero_registro?: string
  nif?: string
  telefone_secundario?: string
  telefone?: string
  email?: string
  razao_social?: string
  nome_fantasia?: string
  nome?: string
  tipo?: string
}
