import User from '#models/user'
import {
  ForgotPasswordDTO,
  ListUserDTO,
  LoginDTO,
  logoutDTO,
  RegisterDTO,
  resetPasswordDTO,
  ShowUserDetailsDTO,
  ShowUserDTO,
  UpdateUserDTO,
  DeleteUserDTO,
} from '#dtos/auth_dto'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import hash from '@adonisjs/core/services/hash'
import Empresa from '#models/empresa'
import {
  buildActivationUrl,
  buildPasswordDefinitionUrl,
  generateSecurePassword,
  getUserPermissions,
  getUserRoles,
  giveRoleToUser,
} from '../helpers/Utils.js'
import { logSecurityEvent } from '../helpers/security_logger.js'
import mail from '@adonisjs/mail/services/main'
import PasswordDefinitionMail from '#mails/password_definition_mail'
import ForgotPasswordMail from '#mails/forgot_password_mail'
import EmailAlteradoActivacaoMail from '#mails/email_alterado_activacao_mail'
import EmailAlteradoAvisoMail from '#mails/email_alterado_aviso_mail'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import VerificationTokenHash from '#models/verification_token_hash'
import InvalidTokenException from '#exceptions/invalid_token_exception'
import EmpresaSuspensaException from '#exceptions/empresa_suspensa_exception'
import { assertPodeCriarUtilizador } from '../helpers/limites_do_plano.js'

export default class authRepository {
  baseQuery(trx?: TransactionClientContract) {
    const query = User.query({ client: trx })
    return query
  }

  async login(data: LoginDTO) {
    const user = await db
      .from('user')
      .where((query) => {
        query.where('user.email', data.uid).orWhere('user.username', data.uid)
      })
      .join('verification_token_hash', 'verification_token_hash.user_id', 'user.id')
      .if(data.company_alias, (query) => {
        if (data.company_alias) {
          query.join('empresa', 'empresa.id', 'user.empresa_id')
          query.where('empresa.company_alias', data.company_alias)
            .select('empresa.company_alias as company_alias')
        }
      })
      // .where('empresa.company_alias', data.company_alias ?? '')
      .where('verification_token_hash.verified', true)
      .whereNull('user.deleted_at')
      .select(['user.id', 'user.password'])
      .first()

    if (!user) {
      throw new Error('Credenciais inválidas')
    }

    const isValidPassword = await hash.verify(user.password, data.password)

    if (!isValidPassword) {
      throw new Error('Credenciais inválidas')
    }
    const userModel = await User.findOrFail(user.id)

    // Uma empresa suspensa não emite sessões novas.
    //
    // O portão das rotas de inquilino já recusa tudo o que venha desta empresa, mas
    // deixar o login passar entregava na mesma um token válido a quem está cortado — e
    // é o token que o frontend usa para decidir o que mostrar, portanto a pessoa
    // entrava e só depois batia em 403 a cada clique.
    //
    // A verificação é pelo `empresa_id` do UTILIZADOR, não pelo `company_alias` do
    // pedido: esse é opcional nesta rota, e bastaria omiti-lo para contornar uma
    // verificação feita sobre ele.
    let empresa: Empresa | null = null
    if (userModel.empresa_id) {
      empresa = await Empresa.find(userModel.empresa_id)
      if (empresa?.estaSuspensa) {
        throw new EmpresaSuspensaException()
      }
    }

    const token = await User.accessTokens.create(userModel)

    return {
      type: 'bearer',
      value: token.value!.release(),
      company_alias: user.company_alias,
      // Se a empresa ainda tem a configuração inicial por fazer.
      //
      // Este sinalizador é a razão de o ecrã de onboarding nunca ter corrido: o frontend
      // decidia por `onboarding_completed === false` (ver `login/page.tsx`), e NENHUMA
      // rota deste backend o devolvia — `undefined` não é `false`, portanto toda a gente
      // caía directamente no painel com o catálogo vazio.
      //
      // `true` quando não há empresa (contas de plataforma): não têm configuração inicial
      // nenhuma a fazer, e mandá-las para o onboarding seria prendê-las num ecrã que não
      // lhes diz respeito.
      onboarding_completed: empresa ? empresa.onboardingConcluido : true,
      ramo_actuacao: empresa?.ramo_actuacao ?? null,
    }
  }

  async logout(auth: logoutDTO) {
    const user = await User.findOrFail(auth.userId)
    const token = auth.token_identifier
    await User.accessTokens.delete(user, token)
    return { message: 'Logout realizado com sucesso' }
  }

  async create(data: RegisterDTO) {
    try {
      // 1. Validar empresa
      const empresa = await Empresa.findBy('company_alias', data.company_alias)

      if (!empresa) {
        throw new Error(`Empresa com alias "${data.company_alias}" não encontrada`)
      }

      // 2. Separar dados
      const { company_alias, papel, ...dataSemAlias } = data

      // 3. Palavra-passe temporária: existe só para a conta nunca ficar sem hash até
      // o utilizador definir a sua pelo link do email. NUNCA sai do servidor — não é
      // enviada, não é devolvida e ninguém a usa para entrar.
      const temporaryPassword = generateSecurePassword()

      // 4. O limite do plano e a criação da conta, indivisíveis.
      //
      // O limite é verificado antes do envio de email, de propósito: recusar depois de o
      // email sair mandaria um convite para uma conta que não existe.
      //
      // E é verificado DENTRO da mesma transacção que insere, com o `trx`, porque
      // contar e depois inserir em separado deixava dois convites simultâneos passarem
      // ambos pelo mesmo limite — no plano Grátis (2 utilizadores) bastava convidar
      // duas pessoas ao mesmo tempo. Ver `limites_do_plano.ts`.
      //
      // A transacção cobre só isto. O papel e o email ficam de fora porque já ficavam:
      // envolvê-los agora mudaria o comportamento de um caminho que não é o que aqui
      // se está a corrigir.
      const user = await db.transaction(async (trx) => {
        await assertPodeCriarUtilizador(empresa.id, trx)

        return User.create(
          {
            ...dataSemAlias,
            empresa_id: empresa.id,
            password: temporaryPassword,
          },
          { client: trx }
        )
      })
      // 5. Atribuir papel/role
      await giveRoleToUser(user, papel)
      // 6. Enviar email
      try {
        const password_definition_url = await buildPasswordDefinitionUrl(company_alias, user.id)

        await mail.send(
          new PasswordDefinitionMail(
            user.email!,
            user.username!,
            empresa.nome || empresa.company_alias,
            password_definition_url
          )
        )
      } catch (emailErr) {
        throw new Exception('Erro ao criar conta')
      }

      return user
    } catch (error) {
      // Uma excepção de DOMÍNIO passa tal e qual.
      //
      // Este `catch` apanhava tudo e devolvia sempre "Erro ao criar conta" — a mesma
      // classe de bug já documentada em 7.4 e 7.17: apaga a distinção entre "não pode" e
      // "rebentou". Com os limites do plano isso passou a ter consequência visível: quem
      // tentasse convidar um funcionário a mais recebia "Erro ao criar conta" em vez de
      // "o plano X permite N utilizadores; actualize o plano".
      //
      // O `instanceof Exception` cobre todas as excepções de domínio deste projecto
      // (partilham a base do `@adonisjs/core`) e o `E_ROW_NOT_FOUND` do Lucid. O resto —
      // falha de infra, erro de SQL — continua a sair como a mensagem genérica, que é o
      // que se quer: essa não se mostra ao utilizador.
      if (error instanceof Exception) throw error
      throw new Exception('Erro ao criar conta')
    }
  }

  async findByEmail(email: string) {
    return await this.baseQuery().where('email', email).first()
  }

  // async sendResetPasswordEmail(user: User) {
  //   // Aqui você pode implementar a lógica para enviar um email de recuperação de senha
  // }

  // async verifyResetToken(user: User, token: string) {
  //   // Aqui você pode implementar a lógica para verificar se o token de recuperação é válido
  //   return token === 'valid-reset-token'
  // }

  async updatePassword(user: User, newPassword: string) {
    user.password = newPassword
    await user.save()
  }

  findById(id: string) {
    return this.baseQuery().where('id', id).first()
  }

  async resetPassword(data: resetPasswordDTO) {
    // 1. Procurar o token e já carregar o utilizador (se possível) para evitar múltiplas queries
    const token = await VerificationTokenHash.query()
      .where('verification_token_public', data.token)
      .first()

    // 2. Validações iniciais (Token existe e é válido)
    if (!token || token.verified || token.deletedAt) {
      throw new InvalidTokenException('Token inválido ou expirado', { code: '400' })
    }

    // 3. Buscar o utilizador
    const user = await User.find(token.user_id)
    if (!user) {
      throw new InvalidTokenException('Utilizador não encontrado', { code: '404' })
    }
    // 4. (Opcional) Validar se o e-mail enviado no DTO coincide com o e-mail do utilizador do token
    // Isso evita que alguém use um token de um e-mail para resetar a senha de outro.
    if (data.email && user.email !== data.email) {
      throw new InvalidTokenException('Este token não pertence a este e-mail', { code: '400' })
    }

    // 5. Atualizar dados numa transação (opcional, mas recomendado)
    user.password = data.password
    token.verified = true

    await user.save()
    await token.save()

    return user
  }

  async forgot_password(data: ForgotPasswordDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)

    // A procura tem de ser POR DOMÍNIO: a unicidade de `email` é por empresa
    // (`unique(['email','empresa_id'])`, ver auth_validator.ts), por isso o mesmo email
    // pode existir em dois tenants — `User.findBy('email', ...)` devolvia o primeiro que
    // aparecesse e podia enviar o link de redefinição ao utilizador da empresa errada.
    // `firstOrFail` em vez do `user?.id!` anterior: sem correspondência, o que se enviava
    // era um email para `undefined` com um link `.../undefined`.
    const user = await User.query()
      .where('email', data.email)
      .where('empresa_id', empresa.id)
      .firstOrFail()

    // Enviar o email de recuperação
    const password_definition_url = await buildPasswordDefinitionUrl(
      empresa.company_alias,
      user.id
    )
    await mail.send(new ForgotPasswordMail(user.email!, user.username!, password_definition_url))

    await VerificationTokenHash.create({
      user_id: user.id,
      purpose: 'password_recovery',
    })
    return user
  }

  async list(data: ListUserDTO) {
    // Começa com a query base
    const query = this.baseQuery()
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('empresa.company_alias', data.company_alias ?? '')
    // Filtro de pesquisa textual (OR entre username e email)
    if (data.query) {
      const search = `%${data.query}%`
      query.where((q) => {
        q.where('username', 'like', search).orWhere('email', 'like', search)
      })
    }
    // Filtros de data (tratados como data de criação, exclusão, atualização)
    // NOTA: se precisar de intervalos, adapte para '>=', '<='
    if (data.created_at) {
      query.where('created_at', '>=', data.created_at)
    }
    if (data.updated_at) {
      query.where('updated_at', '>=', data.updated_at)
    }
    if (data.deleted_at !== undefined) {
      // Se quiser buscar registos onde deleted_at tem um valor específico
      // ou usar isNull/notNull, ajuste conforme a necessidade
      query.where('deleted_at', data.deleted_at)
    }

    // Executa e retorna os resultados
    const paginador = await query
      .select([
        'user.id',
        'user.username',
        'user.email',
        'user.empresa_id',
        'user.created_at',
        'user.updated_at',
        'user.deleted_at',
      ])
      .paginate(data.page ?? 1, data.limit ?? 10)

    // A listagem não dizia a função de cada funcionário — só id/username/email. Sem
    // isto o ecrã de Funcionários não consegue mostrar "Vendedor"/"Estoquista"/etc.
    // Uma query só para a página inteira, agrupada em memória.
    const mapaPapeis = await this.rolesPorUtilizador(paginador.all().map((u) => u.id))
    for (const u of paginador.all()) {
      ;(u as any).$extras.papeis = mapaPapeis.get(u.id) ?? []
      // `$extras` só chega ao JSON com `serializeExtras` definido por instância —
      // mesmo padrão já documentado no catálogo de produtos.
      ;(u as any).serializeExtras = () => (u as any).$extras
    }

    return paginador
  }

  /**
   * Confirma que o utilizador existe E pertence à empresa indicada, devolvendo-o.
   * Sem isto, bastaria adivinhar um UUID para editar/apagar um funcionário de outro
   * tenant — `User.findOrFail(id)` sozinho não sabe nada de empresas.
   */
  private async findScopedOrFail(userId: string, companyAlias: string) {
    await this.baseQuery()
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('user.id', userId)
      .where('empresa.company_alias', companyAlias)
      .select('user.id')
      .firstOrFail()

    return User.findOrFail(userId)
  }

  /**
   * Editar um funcionário. Não existia NENHUMA rota de edição de utilizador — os
   * botões "Editar" do frontend nunca puderam funcionar.
   *
   * Só `username` e `email`: a password é definida pelo próprio (link por email) e os
   * papéis têm o seu próprio recurso (`user-papeis`).
   *
   * **Alterar o email obriga a reactivar a conta.** Um endereço novo é um endereço por
   * provar: até ser confirmado não se sabe se existe, se é do funcionário, ou se foi
   * trocado por engano/por quem não devia. Por isso, quando (e só quando) o email muda:
   *
   *  1. as verificações anteriores são invalidadas (`verified: false` + soft delete) —
   *     `login()` exige um `verification_token_hash` verificado, logo a conta fica sem
   *     entrada; o soft delete é o que impede o link ANTIGO (que está na caixa de
   *     correio antiga) de ser reutilizado para reactivar ou redefinir a password;
   *  2. é criado um token de activação novo e enviado o link para o endereço NOVO;
   *  3. o endereço ANTIGO recebe um aviso — é a única forma de o dono da conta detectar
   *     uma alteração que não pediu;
   *  4. as sessões activas são revogadas, senão o bloqueio seria só de fachada (quem já
   *     tivesse um bearer token continuava a trabalhar como se nada fosse).
   *
   * Tudo em transação, com os emails enviados ANTES do commit: se o envio falhar, nada
   * fica alterado. Bloquear a conta e depois não conseguir entregar o link de activação
   * deixaria o funcionário fechado de fora sem forma de voltar.
   */
  async update(data: UpdateUserDTO) {
    const user = await this.findScopedOrFail(data.user_id, data.company_alias)

    const emailAnterior = user.email
    const emailAlterado = data.email !== undefined && data.email !== emailAnterior

    if (data.username !== undefined) user.username = data.username
    if (data.email !== undefined) user.email = data.email

    if (!emailAlterado) {
      await user.save()
      return { user, emailAlterado: false }
    }

    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)

    const trx = await db.transaction()
    try {
      user.useTransaction(trx)
      await user.save()

      await VerificationTokenHash.query({ client: trx })
        .where('user_id', user.id)
        .whereNull('deleted_at')
        // `new Date()`, não `DateTime.now().toSQL()`: o `toSQL()` do luxon inclui o offset
        // ('... +00:00') e o MySQL recusa-o com "Incorrect datetime value". Mesmo padrão
        // já usado em `Utils.removeRoleFromUser`.
        .update({ verified: false, deleted_at: new Date() })

      const { token } = await new VerificationTokenHashService().createToken(
        { user_id: user.id, purpose: 'account_activation' },
        trx
      )

      await mail.send(
        new EmailAlteradoActivacaoMail(
          user.email,
          user.username!,
          empresa.nome || empresa.company_alias,
          emailAnterior,
          buildActivationUrl(token)
        )
      )

      await mail.send(
        new EmailAlteradoAvisoMail(
          emailAnterior,
          user.username!,
          empresa.nome || empresa.company_alias,
          user.email
        )
      )

      // Revogar as sessões activas. `User.accessTokens` (DbAccessTokensProvider) não
      // aceita esta transação, por isso apaga-se pela própria tabela configurada no model
      // — assim ou tudo isto fica gravado, ou nada fica.
      await trx.from('auth_access_tokens').where('tokenable_id', user.id).delete()

      await trx.commit()
    } catch (error) {
      await trx.rollback()
      throw error
    }

    logSecurityEvent('user_email_changed', {
      user_id: user.id,
      company_alias: data.company_alias,
      email_anterior: emailAnterior,
      email_novo: user.email,
    })

    return { user, emailAlterado: true }
  }

  /**
   * Desactivar/reactivar um funcionário (toggle de `deleted_at`), seguindo o mesmo
   * padrão de `destroy` já usado nos outros recursos do domínio. Nunca apaga a linha:
   * um utilizador está ligado a caixas e vendas históricas.
   */
  async softDelete(data: DeleteUserDTO) {
    const user = await this.findScopedOrFail(data.user_id, data.company_alias)

    user.deletedAt = user.deletedAt ? null : DateTime.now()
    await user.save()
    return user
  }

  /** Papéis de cada utilizador, numa só query, agrupados por `user_id`. Usado para a
   * listagem poder mostrar a função de cada funcionário sem um pedido por linha. */
  async rolesPorUtilizador(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, string[]>()

    const linhas = await db
      .from('user_papel')
      .join('papel', 'papel.id', 'user_papel.papel_id')
      .whereIn('user_papel.user_id', userIds)
      .whereNull('user_papel.deleted_at')
      .select('user_papel.user_id as user_id', 'papel.nome as papel_nome')

    const mapa = new Map<string, string[]>()
    for (const l of linhas) {
      const lista = mapa.get(l.user_id) ?? []
      lista.push(l.papel_nome)
      mapa.set(l.user_id, lista)
    }
    return mapa
  }

  // mostrar dados de um user
  async show(data: ShowUserDTO) {
    const query = this.baseQuery()
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('user.id', data.user_id)

    if (data.company_alias) {
      query.where('empresa.company_alias', data.company_alias)
    }

    await query.firstOrFail()

    const user = await User.findOrFail(data.user_id)

    const roles = await getUserRoles(user)
    const permissions = await getUserPermissions(user)

    return {
      id: user.id,
      nome: user.username,
      email: user.email,

      roles: roles.map((r) => ({
        id: r.id,
        nome: r.nome,
      })),

      permissions: permissions.map((p) => ({
        id: p.id,
        nome: p.nome,
      })),
    }
  }

  async details(data: ShowUserDetailsDTO) {
    const user = await User.findOrFail(data.user_id)

    const roles = await getUserRoles(user)
    const permissions = await getUserPermissions(user)

    return {
      id: user.id,
      nome: user.username,
      email: user.email,
      roles: roles.map((r) => ({
        id: r.id,
        nome: r.nome,
      })),

      permissions: permissions.map((p) => ({
        id: p.id,
        nome: p.nome,
      })),

      empresa: await this.empresaDoUtilizador(user),
    }
  }

  /**
   * Identificação e definições FISCAIS da empresa do utilizador autenticado.
   *
   * Existe porque não havia forma de o frontend saber se a empresa liquida IVA: os
   * documentos assumiam 14% fixos em todos os ecrãs, quando em Angola o regime é por
   * empresa (`empresa.regime_iva`) e a taxa é uma tabela própria (`taxa_iva`, ver o
   * módulo de Relatórios). Uma empresa fora do regime não deve ver linha de IVA nenhuma.
   *
   * Vai no `auth/me` (permissão que todos os papéis já têm) em vez de uma rota nova:
   * são dados da própria empresa de quem está autenticado, e todos os ecrãs de
   * facturação precisam deles logo no arranque.
   */
  private async empresaDoUtilizador(user: User) {
    if (!user.empresa_id) return null

    const linha = await db
      .from('empresa')
      .leftJoin('taxa_iva', 'taxa_iva.id', 'empresa.taxa_iva_id')
      // `empresa` NÃO tem coluna de email (ver as migrations): o email institucional da
      // empresa é o da conta que a registou (`empresa.user_id`). É esse que deve sair nos
      // documentos, em vez do endereço fixo que lá estava.
      .leftJoin('user as dono', 'dono.id', 'empresa.user_id')
      .where('empresa.id', user.empresa_id)
      .select(
        'empresa.id as id',
        'empresa.nome as nome',
        'empresa.nif as nif',
        'empresa.company_alias as company_alias',
        'empresa.localizacao as localizacao',
        'empresa.contacto as contacto',
        'empresa.regime_iva as regime_iva',
        'empresa.ramo_actuacao as ramo_actuacao',
        'empresa.onboarding_concluido_em as onboarding_concluido_em',
        'dono.email as email',
        'taxa_iva.nome as taxa_iva_nome',
        'taxa_iva.percentual as taxa_iva_percentual'
      )
      .first()

    if (!linha) return null

    // mysql2 devolve boolean como 0/1 e DECIMAL como string — normalizar aqui, para o
    // frontend não ter de adivinhar (mesma classe de bug já documentada em `is_service`).
    return {
      id: linha.id,
      nome: linha.nome,
      nif: linha.nif,
      company_alias: linha.company_alias,
      localizacao: linha.localizacao,
      contacto: linha.contacto,
      email: linha.email ?? null,
      regime_iva: Boolean(linha.regime_iva),
      // Configuração inicial. Vai aqui, e não numa rota nova, pela mesma razão que o
      // regime de IVA: são dados da própria empresa de quem está autenticado, e o
      // arranque do frontend já faz este pedido.
      ramo_actuacao: linha.ramo_actuacao ?? null,
      onboarding_concluido: linha.onboarding_concluido_em !== null,
      taxa_iva: {
        nome: linha.taxa_iva_nome ?? null,
        percentual: linha.taxa_iva_percentual != null ? Number(linha.taxa_iva_percentual) : null,
      },
    }
  }
}
