import Lead from '#models/lead'

export default class LeadRepository {
  /** Regista um clique no link de perfil de um promotor. `empresaId` é o `empresa_id` fixo do
   * promotor (null para promotores de plataforma — o clique não fica atribuído a nenhuma loja específica). */
  registar(promotorId: string, empresaId: string | null) {
    return Lead.create({ promotor_id: promotorId, empresa_id: empresaId })
  }
}
