import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Estoque from './Estoque.js'
import Vendas from './Vendas.js'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { DbRememberMeTokensProvider } from '@adonisjs/auth/session'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class Users extends compose(BaseModel, AuthFinder) {
  static accessTokens = DbAccessTokensProvider.forModel(Users, {
    expiresIn: '30 days',
    prefix: 'oat_',
    table: 'auth_access_tokens',
    type: 'auth_token',
    tokenSecretLength: 40,
  })
  static rememberMeToken = DbRememberMeTokensProvider.forModel(Users)

  serializeExtras = true
  public static table = 'users'

  static _users_fields_ = ['id', 'nome', 'email', 'telefone', 'tipo']
  //static _produtos_fields_ = ["nome", "descricao", "qr_code"]

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare nome: string

  @column()
  declare username: string

  @column()
  declare tipo: 'vendedor' | 'administrador' | 'estoquista'

  @column()
  declare email: string

  @column()
  declare telefone: string

  // @column()
  // declare is_super_admin: 'vendedor' | 'administrador' | 'estoquista'

  @column({ serializeAs: null })
  declare password: string

  @hasMany(() => Estoque, { foreignKey: 'registrado_por', localKey: 'id' })
  declare estoque_: HasMany<typeof Estoque>

  @hasMany(() => Vendas, { foreignKey: 'vendedor_id', localKey: 'id' })
  declare vendas_: HasMany<typeof Vendas>
}
