export interface Createempresa_conta_bancariaDTO{
  iban: string,
  conta: string,
  empresa_id@relations.Empresa: string,}
export interface Updateempresa_conta_bancariaDTO{
  iban?: string,
  conta?: string,
  empresa_id@relations.Empresa?: string,}