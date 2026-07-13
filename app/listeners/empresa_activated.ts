import { EmitterLike } from '@adonisjs/core/types/events'
import User from '#models/user'
import empresa from '#models/empresa'
import mail from '@adonisjs/mail/services/main'

/**
 * Listener para quando uma empresa é ativada
 * Responsável por:
 * - Criar primeiro usuário admin
 * - Enviar email de boas-vindas
 * - Realizar outras operações necessárias
 */
export const onEmpresaActivated = async (event: any) => {
  try {
    //console.log(`Empresa ${event.empresaId} foi ativada.`)

    // Busca a empresa e o usuário
    const companyData = await empresa.find(event.empresaId)
    const user = await User.find(event.userId)

    if (!companyData || !user) {
      throw new Error('Empresa ou usuário não encontrado')
    }

    // Enviar email de bem-vindo
    await mail.send((message) => {
      message
        .to(user.email)
        .from(process.env.MAIL_FROM || 'noreply@example.com')
        .subject('Sua empresa foi ativada com sucesso!')
        .htmlView('emails/company_activated', {
          companyName: companyData.nome,
          userName: user.username || user.email,
        })
    })

    //console.log(`Email de ativação enviado para ${user.email}`)
  } catch (error) {
    console.error('Erro ao processar ativação da empresa:', error)
    // Não rethrow para não quebrar o fluxo principal
  }
}
