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
      this.repository(Name)
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

  repository(Name: string) {
    fs.writeFileSync(
      `app/repositories/${Name}_repository.ts`,
      `
import { DateTime } from 'luxon'
import ${Name} from '#models/${Name}'
import {Create${Name}DTO,Update${Name}DTO} from '#dtos/${Name}_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class ${Name}Repository{

 baseQuery(){ return ${Name}.query() }

 paginate(page = 1, limit = 20, deleted: DeletedValue = null){
    let query = this.baseQuery()
    if (deleted === "deleted") {
      query = ${Name}.query().whereNotNull('deleted_at')
    } else if (deleted === "all") {
      query = ${Name}.query()
    } else {
      query = ${Name}.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
 }

 findOrFail(id:string){
  return this.baseQuery().where('id',id).firstOrFail()
 }

 create(data:Create${Name}DTO){
  return ${Name}.create(data)
 }

 async update(id:string,data:Update${Name}DTO){
  const r=await this.findOrFail(id)
  r.merge(data)
  await r.save()
  return r
 }

 async softDelete(id:string){
    const r = await this.findOrFail(id)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
 }

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

export default class ${Name}sController {
    private service = new ${Name}Service()

    // ==================== INDEX ====================
    async index({ request, response,route }: HttpContext) {
        try {
            const page = request.input('page', 1)
            const limit = request.input('limit', 20)            
            const deleted = request.input('deleted', null)
            const data = await this.service.list(page, limit, deleted)
            return response.ok({
                data,
                message: 'Listagem realizada com sucesso',
                status: 200
            })
        } catch (error) {
            console.error('Erro ao listar ${plural}:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== STORE ====================
    async store({ request, response,route }: HttpContext) {
        try {
            const payload = await request.validateUsing(create${Name}Validator)
            const data = await this.service.create(payload)

            return response.created({
                data,
                message: 'Registro criado com sucesso',
                status: 201
            })
        } catch (error: any) {
            // Erro de validação do Vine
            if (error.messages) {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400
                })
            }

            console.error('Erro ao criar ${Name}:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== SHOW ====================
    async show({ params, response,route }: HttpContext) {
        try {
            const data = await this.service.show(params.id)

            return response.ok({
                data,
                message: 'Registro encontrado',
                status: 200
            })
        } catch (error: any) {
            // Captura erro de registro não encontrado (Lucid)
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado',
                    status: 404
                })
            }

            console.error('Erro ao buscar ${Name}:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== UPDATE ====================
    async update({ params, request, response,route }: HttpContext) {
        try {
            const payload = await request.validateUsing(update${Name}Validator,{
                meta:{
                id:params.id
                }
            })
            const data = await this.service.update(params.id, payload)

            return response.ok({
                data,
                message: 'Registro atualizado com sucesso',
                status: 200
            })
        } catch (error: any) {
            // Erro de validação
            if (error.messages) {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400
                })
            }

            // Registro não encontrado
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado para atualização',
                    status: 404
                })
            }

            console.error('Erro ao atualizar ${Name}:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== DESTROY ====================
    async destroy({ params, response,route }: HttpContext) {
        try {
            await this.service.delete(params.id)

            return response.ok({
                data: null,
                message: 'Registro removido/recuperado com sucesso',
                status: 200
            })
        } catch (error: any) {
            // Registro não encontrado
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado para remoção',
                    status: 404
                })
            }

            console.error('Erro ao remover ${Name}:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
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
    const line = `router.resource('${plural}',()=>import('#controllers/${plural}_controller')).apiOnly()`
    if (!c.includes(line)) {
      c += '\n' + line + '\n'
      fs.writeFileSync(routes, c)
    }
  }

  policy(Name: string) {
    const policiesFile = `app/policies/${Name}_policy.ts`
    if (!fs.existsSync(policiesFile)) return
    const content = `
        import User from '#models/user'
        import ${Name} from '#models/${Name}'
        import { BasePolicy } from '@adonisjs/bouncer'
        import type { AuthorizerResponse } from '@adonisjs/bouncer/types'
        export default class ${Name}Policy {}
`.trim()
    fs.writeFileSync(policiesFile, content)

    // actualizar o arquivo de políticas para incluir a nova política
    const mainPoliciesFile = 'app/policies/main.ts'

    if (fs.existsSync(mainPoliciesFile)) {
      let c = fs.readFileSync(mainPoliciesFile, 'utf8')
      const importLine = `import ${Name}Policy from './${Name}_policy'`
      if (!c.includes(importLine)) {
        c = importLine + '\n' + c
        fs.writeFileSync(mainPoliciesFile, c)
      }

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
