import { BaseCommand } from '@adonisjs/core/ace'
import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import User from '#models/user'
import UserPapel from '#models/auth/user_papel'
import Papel from '#models/auth/papel'
import VerificationTokenHash from '#models/verification_token_hash'
import { giveRoleToUser } from '../app/helpers/Utils.js'

const COMPANY_ALIAS = 'qa-audit'
const UID = 'qa.audit@example.com'
const PASSWORD = 'QaAudit123!#'

export default class SeedQaTenant extends BaseCommand {
  static commandName = 'seed:qa-tenant'
  static description = 'Cria (de forma idempotente) uma empresa e um utilizador Admin dedicados a testes automatizados de UI (Playwright)'
  static options = { startApp: true }

  async run() {
    let empresa = await Empresa.findBy('company_alias', COMPANY_ALIAS)
    if (!empresa) {
      empresa = await Empresa.create({
        nome: 'QA Audit Empresa',
        nif: '5000000000',
        tamanho: 'pequena',
        status: true,
        inadiplente: false,
        regime_iva: false,
        company_alias: COMPANY_ALIAS,
        localizacao: 'Luanda',
        contacto: '900000000',
        verified: true,
      } as any)
      this.logger.success(`Empresa criada: ${COMPANY_ALIAS}`)
    } else {
      this.logger.info(`Empresa já existe: ${COMPANY_ALIAS}`)
    }

    let user = await User.findBy('email', UID)
    if (!user) {
      user = await User.create({
        username: 'qa.audit',
        email: UID,
        password: PASSWORD,
        empresa_id: empresa.id,
      })
      this.logger.success(`Utilizador criado: ${UID}`)
    } else {
      this.logger.info(`Utilizador já existe: ${UID}`)
    }

    const existingToken = await VerificationTokenHash.query()
      .where('user_id', user.id)
      .where('purpose', 'account_activation')
      .first()

    if (!existingToken) {
      await VerificationTokenHash.create({
        user_id: user.id,
        empresa_id: empresa.id,
        purpose: 'account_activation',
        verification_token_public: randomUUID(),
        verification_token_hash: randomUUID(),
        verified: true,
      })
      this.logger.success('Verification token criado (conta ativada)')
    }

    const adminPapel = await Papel.findByOrFail('nome', 'Admin')
    const hasAdminRole = await UserPapel.query()
      .where('user_id', user.id)
      .where('papel_id', adminPapel.id)
      .first()
    if (!hasAdminRole) {
      await giveRoleToUser(user, 'Admin')
      this.logger.success('Papel Admin atribuído')
    } else {
      this.logger.info('Papel Admin já atribuído')
    }

    this.logger.success('Pronto. Credenciais de login para testes automatizados:')
    console.log({ company_alias: COMPANY_ALIAS, uid: UID, password: PASSWORD })
  }
}
