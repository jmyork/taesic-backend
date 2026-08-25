import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo, manyToMany } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import permissao from './permissao.js'
import Empresa from '../empresa.js'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'

/**
 * A que mundo pertence um papel.
 *
 * Isto substituiu a leitura do NOME como forma de saber quem é administrador de
 * plataforma. Enquanto `papel.nome` era único globalmente, `nome LIKE
 * 'Platform_%'` era uma verificação viável; a partir do momento em que cada
 * empresa passou a poder criar os seus papéis, deixou de o ser — uma empresa
 * criava um papel chamado `Platform_Admin` e escalava. A decisão passou para
 * aqui, onde o inquilino não lhe chega.
 *
 *   plataforma  o dono da plataforma. `empresa_id` NULL.
 *   modelo      um dos padrões, clonado no registo de cada empresa. `empresa_id`
 *               NULL, e NUNCA atribuível a um utilizador.
 *   empresa     papel próprio de uma empresa. O único que um utilizador de
 *               inquilino chega a receber.
 *
 * O invariante entre `escopo` e `empresa_id` é garantido pela base de dados
 * (`papel_escopo_empresa_chk`), não por convenção.
 */
export const ESCOPO_PAPEL = {
  plataforma: 'plataforma',
  modelo: 'modelo',
  empresa: 'empresa',
} as const

export type EscopoPapel = (typeof ESCOPO_PAPEL)[keyof typeof ESCOPO_PAPEL]

/**
 * Prefixo reservado aos papéis de plataforma.
 *
 * Já não é o que decide autorização nenhuma — `escopo` é. Continua proibido na
 * criação por empresa por uma razão diferente e mais simples: um papel de
 * inquilino chamado `Platform_Admin` não escala nada, mas engana quem o lê num
 * ecrã ou num registo de auditoria, e uma fronteira de acesso não é sítio para
 * ambiguidades de leitura.
 */
export const PREFIXO_PLATAFORMA = 'Platform_'

export default class Papel extends BaseModel {
  static table = 'papel'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null


  @beforeCreate()
  static uuid(model: Papel) {
    model.id ??= randomUUID()
  }

  @manyToMany(() => permissao, {
    relatedKey: 'id',
    localKey: 'id',
    pivotForeignKey: 'papel_id',
    pivotRelatedForeignKey: 'permissao_id',
  })
  declare permissao: ManyToMany<typeof permissao>

  @column()
  declare nome: string

  @column()
  declare descricao: string

  /** NULL para `plataforma` e `modelo`; obrigatório para `empresa`. */
  @column()
  declare empresa_id: string | null

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  @column()
  declare escopo: EscopoPapel

  // NOTA: a tabela tem ainda `chave_escopo VARCHAR(64) NOT NULL`, que serve o
  // índice único dos três âmbitos — `unique(empresa_id, nome)` não servia, porque
  // no MySQL dois NULL contam como distintos e dois `Platform_Admin` passariam
  // ambos.
  //
  // É preenchida por GATILHO (`papel_chave_escopo_bi`/`_bu`, BEFORE INSERT e
  // BEFORE UPDATE), com `COALESCE(empresa_id, escopo)`. Foi uma coluna GERADA até
  // o servidor de qualidade recusar o índice sobre ela ("Function or expression
  // 'coalesce(...)' cannot be used in the GENERATED ALWAYS AS clause") — o motor
  // de lá não é o mesmo do ambiente de desenvolvimento. Ver a migração
  // `..._796_alter_papel_chave_escopo_sem_coluna_gerada`.
  //
  // NÃO é declarada aqui de propósito. O gatilho sobrepõe-se a qualquer valor que
  // se lhe atribua, portanto declará-la só criaria a ilusão de que se pode
  // escrever nela. O gatilho é também a razão de isto ser um gatilho e não um
  // `@beforeSave`: esta tabela é escrita por dois projectos, pelos seeders e por
  // SQL à mão, e um hook do model não cobria nenhum desses caminhos.

  get ehDePlataforma(): boolean {
    return this.escopo === ESCOPO_PAPEL.plataforma
  }

  get ehModelo(): boolean {
    return this.escopo === ESCOPO_PAPEL.modelo
  }

  /** Só um papel de empresa pode ser atribuído a um utilizador de inquilino. */
  pertenceA(empresaId: string): boolean {
    return this.escopo === ESCOPO_PAPEL.empresa && this.empresa_id === empresaId
  }
}
