import User from '#models/user'
import empresa from '#models/empresa'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import EmpresaActivated from '#events/empresa_activated'

/**
 * Envia o email de boas-vindas quando uma empresa é activada. Antes desta correcção, o
 * `emitter.on('empresa:activated', ...)` que ligava este listener estava comentado em
 * `start/events.ts` — o evento nunca era emitido nem ouvido, isto nunca corria.
 */
export const onEmpresaActivated = async (event: EmpresaActivated) => {
  try {
    const companyData = await empresa.find(event.empresaId)
    const user = await User.find(event.userId)

    if (!companyData || !user) {
      console.error(`onEmpresaActivated: empresa ${event.empresaId} ou user ${event.userId} não encontrado`)
      return
    }

    await mail.send((message) => {
      message
        .to(user.email)
        .from(env.get('MAIL_FROM', 'noreply@alaragest.com'))
        .subject('Sua empresa foi ativada com sucesso!')
        .htmlView('emails/company_activated', {
          companyName: companyData.nome,
          userName: user.username || user.email,
          year: new Date().getFullYear(),
        })
    })
  } catch (error) {
    console.error('Erro ao processar ativação da empresa:', error)
    // Não relançar — uma falha de email não deve reverter a activação da empresa.
  }
}
