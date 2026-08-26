import { DateTime } from 'luxon'
import {
  BaseModel,
  column,
  beforeCreate,
  beforeSave,
  belongsTo,
  manyToMany,
} from '@adonisjs/lucid/orm'
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

/**
 * A chave que sustenta o índice único dos três âmbitos.
 *
 * `unique(empresa_id, nome)` não servia: no MySQL dois NULL contam como
 * distintos num índice único, portanto dois `Platform_Admin` com `empresa_id`
 * NULL passariam ambos. `COALESCE(empresa_id, escopo)` dá uma chave sempre
 * preenchida e cobre os três casos: (<uuid-da-empresa>,'Vendedor'),
 * ('plataforma','Platform_Admin') e ('modelo','Vendedor').
 *
 * EXPORTADA, e não escondida no hook, porque há caminhos de escrita que não
 * passam pelo model — os `multiInsert` em `papeis_da_empresa.ts` e na migração
 * do backfill. Uma só definição, usada por todos, é o que impede que um deles
 * calcule a chave de outra maneira.
 */
export function chaveEscopoDe(papel: { empresa_id?: string | null; escopo: EscopoPapel }): string {
  return papel.empresa_id ?? papel.escopo
}

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

  /**
   * Serve o índice único dos três âmbitos. Ver `chaveEscopoDe` acima.
   *
   * PASSOU A SER DECLARADA AQUI, e o hook abaixo passou a preenchê-la. Antes não
   * era — o comentário que estava neste sítio dizia que declará-la "só criaria a
   * ilusão de que se pode escrever nela", porque o gatilho se sobrepõe a
   * qualquer valor atribuído. O raciocínio estava certo e a conclusão estava
   * errada, e custou o registo de empresas inteiro em `api-qua`:
   *
   *     Field 'chave_escopo' doesn't have a default value  (ER_NO_DEFAULT_FOR_FIELD)
   *
   * O gatilho não existia naquele servidor. A migração 796 tornava a coluna
   * NOT NULL no passo 4 e criava os gatilhos no passo 5; como o MySQL não faz DDL
   * transaccional, o passo 5 falhar deixa o passo 4 feito — coluna obrigatória,
   * sem valor por omissão e sem ninguém a preenchê-la. A partir daí NENHUMA
   * escrita em `papel` passava, e criar uma empresa deixou de ser possível.
   *
   * A lição, e a regra que fica: **um campo novo tem de ter valor por omissão ou
   * ser opcional.** Uma coluna derivada, que existe para arrumação interna, nunca
   * pode ser o motivo de uma escrita de negócio falhar. A coluna passou a
   * anulável (migração 797) e a aplicação passa a preenchê-la ela própria.
   *
   * O gatilho CONTINUA a existir, e continua a valer a pena: cobre os caminhos
   * que não passam por aqui — o `taesic-backoffice-api`, que escreve na mesma
   * tabela, e o SQL à mão. Deixou é de ser a única coisa entre a aplicação e uma
   * paragem total. Onde os dois actuam, escrevem o mesmo valor.
   */
  @column()
  declare chave_escopo: string | null

  /**
   * Corre em criação E em actualização, tal como os dois gatilhos: mudar o
   * `escopo` ou o `empresa_id` de um papel muda a chave, e uma chave velha punha
   * a linha no sítio errado do índice único.
   */
  @beforeSave()
  static preencherChaveEscopo(model: Papel) {
    model.chave_escopo = chaveEscopoDe(model)
  }

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
