import { DateTime } from 'luxon'
import Empresa from '#models/empresa'
import { UpdateempresaDTO } from '#dtos/empresa_dto'
import { CreateEmpresaUserDTO } from '#dtos/EmpresaUserDetalhes'

import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import VerificationTokenHashService from '#services/verification_token_hash_service'
// import authService from '#services/auth_service'
// import empresaService from '#services/empresa_service'
import { giveRoleToUser } from '../helpers/Utils.js'
import pessoa from '#models/pessoa'
import { randomUUID } from 'crypto'
import env from '#start/env'

export default class empresaRepository {
  baseQuery(trx?: TransactionClientContract) {
    const query = Empresa.query({ client: trx })
    return query
  }

  paginate(page = 1, limit = 20) {
    return this.baseQuery().paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  // create(data: CreateempresaDTO) {
  //   return Empresa.create(data)
  // }

  async update(id: string, data: UpdateempresaDTO) {
    const r = await this.findOrFail(id)
    // Removido: r.useTransaction(trx) — desnecessário, o modelo já está associado à transação
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string) {
    const r = await this.findOrFail(id)
    // Removido: r.useTransaction(trx)
    r.deletedAt = DateTime.now()
    await r.save()
  }

  async getUnverifiedCompanies(trx?: TransactionClientContract) {
    return this.baseQuery(trx).where('verified', false)
  }
 
  async CreateEmpresaUserDetalhes(data: CreateEmpresaUserDTO) {
    const trx = await db.transaction()

    try {
      const verifyTokenS = new VerificationTokenHashService()

      // USER (Model)
      const user = new User()
      user.fill({
        username: data.user_username,
        email: data.user_email,
        password: data.user_password,
      })
      user.useTransaction(trx)
      await user.save()

      // EMPRESA (Model)
      const empresa = new Empresa()
      empresa.fill({
        nome: data.empresa_nome,
        nif: data.empresa_nif,
        company_alias: data.empresa_company_alias,
        contacto: data.empresa_contacto,
        localizacao: data.empresa_localizacao,
        tamanho: data.empresa_tamanho,
        regime_iva: data.empresa_regime_iva,
        inadiplente: data.empresa_inadiplente,
        status: data.empresa_status,
        verified: data.empresa_verified,
        user_id: user.id,
      })
      empresa.useTransaction(trx)
      await empresa.save()

      user.empresa_id = empresa.id
      await user.save()

      // TOKEN (Service)
      const token = await verifyTokenS.createToken(
        {
          user_id: user.id,
          empresa_id: empresa.id,
          purpose: 'account_activation',
        },
        trx
      )

      await giveRoleToUser(user, 'Admin', trx)
      await trx.commit()

      // -----------------------------
      // Fora da transação: Pessoa + Foto
      // -----------------------------
      let imageUrl: string
      if (data.dados_foto) {
        const file = data.dados_foto
        const fileName = `${randomUUID()}.${file.extname}`
        const imagePath = `images/products/${fileName}`
        await file.moveToDisk(imagePath)

        imageUrl =
          env.get('NODE_ENV') !== 'development'
            ? `${env.get('R2_ENDPOINT')}/${env.get('R2_BUCKET')}/${imagePath}`
            : `${env.get('R2_DEV_SHOW_ENDPOINT')}/${imagePath}`
      } else {
        // Imagem padrão
        imageUrl = `${env.get('R2_ENDPOINT')}/${env.get('R2_BUCKET')}/images/default-user.png`
      }

      const p = await pessoa.create({
        nome: data.dados_nome,
        sobrenome: data.dados_sobrenome,
        img_url: imageUrl,
        user_id: user.id,
        empresa_id: empresa.id,
      })

      return { user, empresa, token, p }
    } catch (error) {
      await trx.rollback()
      console.error('Erro ao criar empresa + user:', error)
      throw error
    }
  }
}
