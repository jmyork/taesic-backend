import User from '#models/user'
import empresa from '#models/empresa'
import mail from '@adonisjs/mail/services/main'
import CompanyActivatedMail from '#mails/company_activated_mail'
import { buildPasswordDefinitionUrl } from '../helpers/Utils.js'
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

    const passwordDefinitionUrl = await buildPasswordDefinitionUrl(companyData.company_alias, user.id)

    await mail.send(
      new CompanyActivatedMail(user.email, user.username || user.email, companyData.nome, passwordDefinitionUrl)
    )
  } catch (error) {
    console.error('Erro ao processar ativação da empresa:', error)
    // Não relançar — uma falha de email não deve reverter a activação da empresa.
  }
}
