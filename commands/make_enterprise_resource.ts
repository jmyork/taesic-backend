import { BaseCommand, args } from '@adonisjs/core/ace'

import fs from 'node:fs'

export default class MakeEnterpriseResource extends BaseCommand {
  static commandName = 'make:enterprise:resource'

  // aceita vários argumentos
  @args.spread()
  declare names: string[]

  async run() {
    if (!this.names.length) {
      this.logger.error('Informe ao menos um nome')
      return
    }

    this.ensureDirs()

    for (const Name of this.names) {
      const name = Name.toLowerCase()
      const plural = name
      const table = plural

      this.logger.info('criando ' + Name)
      this.model(Name, table)
      this.migration(table)
      this.dto(Name)
      this.validator(Name)
      this.repository(Name, table)
      this.service(Name)
      this.controller(Name, plural)
      this.route(plural)
      this.policy(Name)
    }

    this.logger.success('recursos criados.')
  }

  ensureDirs() {
    const dirs = [
      'app/dtos',
      'app/repositories',
      'app/services',
      'app/validators',
      'app/controllers',
      'app/models',
      'database/migrations',
      'app/policies',
    ]
    dirs.forEach((d) => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
    })
  }

  migration(table: string) {
    const file = `database/migrations/${Date.now()}_${table}.ts`
    fs.writeFileSync(
      file,
      `
import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema{
 protected tableName='${table}'
 async up(){
  this.schema.createTable(this.tableName,(table)=>{
   table.uuid('id').primary()
   table.timestamps(true,true)
   table.timestamp('deleted_at').nullable().index()
  })
 }
 async down(){ this.schema.dropTable(this.tableName) }
}
`.trim()
    )
  }

  model(Name: string, table: string) {
    fs.writeFileSync(
      `app/models/${Name}.ts`,
      `
import { DateTime } from 'luxon'
import { BaseModel,column,beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class ${Name} extends BaseModel{

 static table='${table}'

 @column({isPrimary:true})
 declare id:string

 @column.dateTime({autoCreate:true})
 declare createdAt:DateTime

 @column.dateTime({autoCreate:true,autoUpdate:true})
 declare updatedAt:DateTime

 @column.dateTime()
 declare deletedAt:DateTime|null

 @beforeCreate()
 static uuid(model:${Name}){
  model.id ??= randomUUID()
 }

}
`.trim()
    )
  }

  dto(Name: string) {
    fs.writeFileSync(
      `app/dtos/${Name}_dto.ts`,
      `export interface Create${Name}DTO{}
export interface Update${Name}DTO{}`
    )
  }

  validator(Name: string) {
    fs.writeFileSync(
      `app/validators/${Name}_validator.ts`,
      `
import vine from '@vinejs/vine'
import { randomUUID } from 'crypto';
import UniqueValidator from '../helpers/Validator.js'
export const create${Name}Validator=vine.compile(vine.object({}))
export const update${Name}Validator=vine.compile(vine.object({}))
`.trim()
    )
  }

  repository(Name: string, table: string) {
    fs.writeFileSync(
      `app/repositories/${Name}_repository.ts`,
      `
import ${Name} from '#models/${Name}'
import {Create${Name}DTO,Update${Name}DTO} from '#dtos/${Name}_dto'
import BaseRepository from './base_repository.js'

export default class ${Name}Repository extends BaseRepository<InstanceType<typeof ${Name}>, Create${Name}DTO, Update${Name}DTO> {

  constructor() {
    super(${Name}, '${table}')
  }

  // Este recurso pertence a uma empresa (tem company_alias/empresa_id)? Sobrescrever
  // scopeToTenant para isolar por tenant — sem isto, paginate/findOrFail/update/softDelete
  // NÃO filtram por company_alias mesmo que seja passado, e qualquer empresa consegue ler/
  // alterar registos de outra. Ver cliente_repository.ts para um exemplo real.
  //
  // protected scopeToTenant(query: any, companyAlias: string) {
  //   return query.join('empresa', 'empresa.id', '${table}.empresa_id').where('empresa.company_alias', companyAlias)
  // }
}
`.trim()
    )
  }

  service(Name: string) {
    fs.writeFileSync(
      `app/services/${Name}_service.ts`,
      `
import ${Name}Repository from '#repositories/${Name}_repository'
import {Create${Name}DTO,Update${Name}DTO} from '#dtos/${Name}_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class ${Name}Service{

 repo=new ${Name}Repository()

list(page?: number, limit?: number, deleted?:DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
}

 create(data:Create${Name}DTO){ return this.repo.create(data) }

 show(id:string){ return this.repo.findOrFail(id) }

 update(id:string,data:Update${Name}DTO){ return this.repo.update(id,data) }

 delete(id:string){ return this.repo.softDelete(id) }

}
`.trim()
    )
  }

  controller(Name: string, plural: string) {
    const content = `
import type { HttpContext } from '@adonisjs/core/http'
import ${Name}Service from '#services/${Name}_service'
import { create${Name}Validator, update${Name}Validator } from '#validators/${Name}_validator'

// Erros de validação (VineJS), "registo não encontrado" (Lucid) e qualquer Exception de
// domínio lançada pelo repository/service já são traduzidos de forma consistente pelo
// handler global (app/exceptions/handler.ts) — não repetir aqui "if (error.code === 'X')";
// só apanhar um erro nesta classe se for preciso fazer algo diferente do envelope padrão.
export default class ${Name}sController {
    private service = new ${Name}Service()

    // ==================== INDEX ====================
    async index({ request }: HttpContext) {
        const page = request.input('page', 1)
        const limit = request.input('limit', 20)
        const deleted = request.input('deleted', null)
        const data = await this.service.list(page, limit, deleted)
        return { data, message: 'Listagem realizada com sucesso', status: 200 }
    }

    // ==================== STORE ====================
    async store({ request, response }: HttpContext) {
        const payload = await request.validateUsing(create${Name}Validator)
        const data = await this.service.create(payload)
        return response.created({ data, message: 'Registro criado com sucesso', status: 201 })
    }

    // ==================== SHOW ====================
    async show({ params }: HttpContext) {
        const data = await this.service.show(params.id)
        return { data, message: 'Registro encontrado', status: 200 }
    }

    // ==================== UPDATE ====================
    async update({ params, request }: HttpContext) {
        const payload = await request.validateUsing(update${Name}Validator, {
            meta: { id: params.id },
        })
        const data = await this.service.update(params.id, payload)
        return { data, message: 'Registro atualizado com sucesso', status: 200 }
    }

    // ==================== DESTROY ====================
    async destroy({ params }: HttpContext) {
        await this.service.delete(params.id)
        return { data: null, message: 'Registro removido/recuperado com sucesso', status: 200 }
    }
}
`.trim()

    fs.writeFileSync(`app/controllers/${plural}_controller.ts`, content)
  }

  route(plural: string) {
    const routes = 'start/routes.ts'
    if (!fs.existsSync(routes)) return
    let c = fs.readFileSync(routes, 'utf8')

    const importRouter = "import router from '@adonisjs/core/services/router'"
    if (!c.includes(importRouter)) c = importRouter + '\n' + c
    const importMiddleware = "import { middleware } from './kernel.js'"
    if (!c.includes(importMiddleware)) c = importMiddleware + '\n' + c

    // Exige sessão autenticada por omissão — sem isto a rota gerada ficava completamente
    // pública. Isto NÃO isola por company_alias nem aplica RBAC por si só: um recurso
    // por-empresa tem de ser registado em companydomainroutes.ts (grupo `api/:company_alias`
    // com ValidateCompanyAliasMiddleware + permission), não aqui — ver comentário em
    // start/routes.ts sobre a diferença entre os dois ficheiros.
    const line = `router.resource('${plural}',()=>import('#controllers/${plural}_controller')).apiOnly().use('*', middleware.auth({ guards: ['api'] }))`
    if (!c.includes(line)) {
      c += '\n' + line + '\n'
      fs.writeFileSync(routes, c)
    }
  }

  policy(Name: string) {
    // Nota: antes desta correção, um `if (!fs.existsSync(policiesFile)) return` invertido
    // fazia este método nunca criar o ficheiro para um recurso novo (só faria algo se a
    // policy já existisse) — a policy nunca era gerada nem registada em main.ts.
    const policiesFile = `app/policies/${Name}_policy.ts`
    const content = `
        import User from '#models/user'
        import ${Name} from '#models/${Name}'
        import { BasePolicy } from '@adonisjs/bouncer'
        import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

        // Stub vazio: sem métodos definidos, chamar bouncer.authorize(...) com esta policy
        // rebenta em vez de bloquear. Preencher com regras reais (ex.: index/store/update/
        // delete) antes de usar Bouncer neste controller — até lá, a única coisa que
        // protege esta rota é o middleware.auth() aplicado em routes.ts.
        export default class ${Name}Policy extends BasePolicy {}
`.trim()
    fs.writeFileSync(policiesFile, content)

    // actualizar o arquivo de políticas para incluir a nova política
    const mainPoliciesFile = 'app/policies/main.ts'

    if (fs.existsSync(mainPoliciesFile)) {
      let c = fs.readFileSync(mainPoliciesFile, 'utf8')

      // Nota: chegou a existir aqui um `import ${Name}Policy from './${Name}_policy'`
      // estático no topo do ficheiro — nunca era usado (o registo real é só a entrada
      // dynamic-import abaixo, com o alias '#policies/...'), ficava sempre por trás do
      // bug do `return` invertido acima, e quando esse bug foi corrigido passou a
      // rebentar o typecheck (faltava-lhe a extensão `.js`, exigida em ESM/nodenext).
      // Removido — a entrada no objeto `policies` é a única coisa necessária.

      const exportLine = `  ${Name}Policy: () => import('#policies/${Name}_policy')`
      if (!c.includes(exportLine)) {
        const exportIndex = c.indexOf('export const policies = {')
        if (exportIndex !== -1) {
          const insertIndex = c.indexOf('}', exportIndex)
          if (insertIndex !== -1) {
            c =
              c.slice(0, insertIndex) +
              `  ${Name}Policy: () => import('#policies/${Name}_policy'),\n` +
              c.slice(insertIndex)
            fs.writeFileSync(mainPoliciesFile, c)
          }
        }
      }
    }
  }
}
