import { DateTime } from 'luxon'
import verification_token_hash from '#models/verification_token_hash'
import {
  Createverification_token_hashDTO,
  Updateverification_token_hashDTO,
} from '#dtos/verification_token_hash_dto'
import { DeletedValue } from '../helpers/Types.js'
import hash from '@adonisjs/core/services/hash'
import empresaRepository from './empresa_repository.ts'
import Empresa from '#models/empresa'
import { randomUUID } from 'node:crypto'
import { ResendCompanyActivationEmailDTO } from '#dtos/empresa_dto'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import emitter from '@adonisjs/core/services/emitter'
import EmpresaActivated from '#events/empresa_activated'
const empresaRepo = new empresaRepository()
export default class verification_token_hashRepository {
  baseQuery() {
    return verification_token_hash.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = verification_token_hash.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = verification_token_hash.query()
    } else {
      query = verification_token_hash.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: Createverification_token_hashDTO) {
    return verification_token_hash.create(data)
  }

  async update(id: string, data: Updateverification_token_hashDTO) {
    const r = await this.findOrFail(id)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string) {
    const r = await this.findOrFail(id)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
  }

  async verify(token: string) {
    const record = await verification_token_hash
      .query()
      .where('verification_token_public', token)
      .whereNull('deleted_at')
      .first()

    if (!record) {
      return {
        success: false,
        message: 'Token inválido',
      }
    }

    if (record.verified) {
      return {
        success: false,
        message: 'Token já foi usado',
      }
    }

    if (record.verification_token_expires_at < DateTime.now()) {
      return {
        success: false,
        message: 'Token expirado',
      }
    }

    record.verified = true
    await record.save()

    // A ativação da conta (o único chamador deste método, via empresaService.activateCompany)
    // tem de marcar a EMPRESA como verificada — antes só o token ficava marcado, e
    // `empresa.verified` nunca era actualizado, deixando a empresa permanentemente por
    // verificar mesmo depois de um clique de ativação bem-sucedido.
    if (record.empresa_id) {
      await Empresa.query().where('id', record.empresa_id).update({ verified: true })

      if (record.purpose === 'account_activation' && record.user_id) {
        // `empresa:activated` existia desde sempre mas nunca era emitido nem ouvido (ver
        // start/events.ts) — o email de boas-vindas nunca chegou a ser enviado.
        await emitter.emit(EmpresaActivated, new EmpresaActivated(record.empresa_id, record.user_id))
      }
    }

    return {
      success: true,
      message: 'Token verificado com sucesso',
    }
  }


  /**
   * Envia email de verificação
   */

  async ResendVerificationEmail(data: ResendCompanyActivationEmailDTO) {
    // Busca a empresa e dados do utilizador com aliases claros
    const dadosEmpresa = await empresaRepo
      .baseQuery()
      .join('verification_token_hash', 'verification_token_hash.empresa_id', 'empresa.id')
      .join('user', 'user.id', 'empresa.user_id')
      .join('pessoa', 'pessoa.user_id', 'user.id')
      .where((builder) => {
        builder
          .where('empresa.nif', data.nif_ou_company_alias)
          .orWhere('empresa.company_alias', data.nif_ou_company_alias)
      })
      .select([
        'empresa.id as empresa_id',
        'empresa.nome as empresa_nome',
        'empresa.company_alias as empresa_alias',
        'empresa.nif as empresa_nif',
        'user.id as user_id',
        'user.email as user_email',
        'pessoa.nome as user_nome',
        'verification_token_hash.verified as verified',
        'verification_token_hash.id as verification_token_id',
      ])
      .first()
    
    console.log(dadosEmpresa)
    // Se não encontrou, retorna null (ou lança, conforme tua política)
    if (!dadosEmpresa) {
      return null
    }

    // Se já verificada, retorna false para o controller tratar
    if (dadosEmpresa.verified) {
      return false
    }
    console.log(dadosEmpresa)
    // Desativar token existente (usa o id do token retornado ou procura pelo empresa_id)
    // Preferimos usar o id do token se disponível
    let vth
    if (dadosEmpresa?.$extras.verification_token_id) {
      vth = await verification_token_hash.findOrFail(dadosEmpresa?.$extras.verification_token_id)
    } else {
      vth = await verification_token_hash.findByOrFail('empresa_id', dadosEmpresa.id)
    }
    vth.verification_token_expires_at = DateTime.now().minus({ seconds: 10 })
    await vth.save()

    // Criar novo token (fora de transaction)
    const verifyTokenS = new VerificationTokenHashService()
    const token = await verifyTokenS.createToken({
      user_id: dadosEmpresa?.$extras.user_id,
      empresa_id: dadosEmpresa?.id,
      purpose: 'account_activation',
    })

    // Retorna um objeto plano com os campos que o controller vai usar diretamente
    return {
      empresa_id: dadosEmpresa?.id,
      empresa_nome: dadosEmpresa?.nome,
      empresa_alias: dadosEmpresa?.$extras.empresa_alias,
      empresa_nif: dadosEmpresa?.nif,
      user_id: dadosEmpresa?.user_id,
      user_email: dadosEmpresa?.$extras.user_email,
      user_nome: dadosEmpresa?.$extras.user_nome,
      verified: dadosEmpresa?.verified,
      token,
    }
  }
}
