import { BaseCommand, args } from '@adonisjs/core/ace'
import fs from 'node:fs'

type Field = {
  name: string
  type: string
  optional: boolean
  isRelation?: boolean
  relationModel?: string
}

export default class ResourceSync extends BaseCommand {
  static commandName = 'resource:sync'

  @args.string()
  declare signature: string

  async run() {
    const { modelPascal, modelLower, fields } = this.parse(this.signature)

    const table = modelLower

    // Cria o recurso base se não existir (usando o nome PascalCase)
    const exists = fs.existsSync(`app/models/${modelPascal}.ts`)
    if (!exists) {
      this.logger.info('Recurso não existe, criando...')
      await this.kernel.exec('make:enterprise:resource', [modelPascal])
    }

    this.updateModel(modelPascal, fields)
    this.updateDTO(modelPascal, modelLower, fields)
    this.updateValidator(modelPascal, modelLower, fields)
    this.createMigration(table, fields)

    this.logger.success('Sync concluído')
  }

  // ================= PARSER =================
  parse(sig: string) {
    const parts = sig.split(':')
    const rawModel = parts.shift()!

    // Normaliza para PascalCase (ex: "papel" -> "Papel")
    const modelPascal = rawModel.toLowerCase()
    const modelLower = modelPascal.toLowerCase()

    const rest = parts.join(':')
    const fields = rest
      .split(',')
      .filter(Boolean)
      .map((f) => {
        const [name, typeRaw] = f.split(':')
        const optional = typeRaw?.endsWith('?')
        const rawType = typeRaw?.replace('?', '') || 'string'

        // Detecta relação @relation(Modelo)
        // const relationMatch = rawType.match(/^@relation\((\w+)\)$/)
        const relationMatch = rawType.match(/^relation\.(\w+)$/)
        if (relationMatch) {
          const relationModel = relationMatch[1]
          return {
            name,
            type: 'relation',
            optional,
            isRelation: true,
            relationModel,
          }
        }

        // Campo normal
        return { name, type: rawType, optional }
      })

    return { modelPascal, modelLower, fields }
  }

  // ================= MODEL =================
  private updateModel(model: string, fields: Field[]) {
    const file = `app/models/${model}.ts`
    if (!fs.existsSync(file)) return

    let content = fs.readFileSync(file, 'utf8')

    // Verifica se precisa adicionar imports de relação
    const needsBelongsTo = fields.some((f) => f.isRelation)
    if (needsBelongsTo) {
      // 1. Adicionar belongsTo no import do @adonisjs/lucid/orm se necessário
      const ormImportRegex = /import\s+{\s*([^}]+)\s*}\s+from\s+['"]@adonisjs\/lucid\/orm['"]/
      const ormMatch = content.match(ormImportRegex)
      if (ormMatch) {
        const existingImports = ormMatch[1].split(',').map((i) => i.trim())
        if (!existingImports.includes('belongsTo')) {
          existingImports.push('belongsTo')
          const newImport = `import { ${existingImports.join(', ')} } from '@adonisjs/lucid/orm'`
          content = content.replace(ormImportRegex, newImport)
        }
      } else {
        // Se não existir import do orm, adicionar no início (improvável, mas seguro)
        content = `import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'\n` + content
      }

      // ------- Adicionar imports dos modelos relacionados -------
      const importModels = new Set<string>()
      fields.forEach((f) => {
        if (f.isRelation && f.relationModel) {
          importModels.add(f.relationModel)
        }
      })

      importModels.forEach((m) => {
        const modelImport = `import ${m} from './${m}.js'`
        if (!content.includes(modelImport)) {
          content = modelImport + '\n' + content
        }
      })

      // 2. Adicionar import do tipo BelongsTo do '@adonisjs/lucid/types/relations' se necessário
      const typeImport = "import type { BelongsTo } from '@adonisjs/lucid/types/relations'"
      if (!content.includes(typeImport)) {
        const lines = content.split('\n')
        let lastImportIndex = -1
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('import ')) {
            lastImportIndex = i
          } else if (lastImportIndex !== -1 && !lines[i].startsWith('import ')) {
            break
          }
        }
        if (lastImportIndex !== -1) {
          lines.splice(lastImportIndex + 1, 0, typeImport)
          content = lines.join('\n')
        } else {
          content = typeImport + '\n' + content
        }
      }
    }

    // Coleta novas declarações (colunas + relações)
    let newDeclarations = ''

    for (const f of fields) {
      // Verifica se a coluna já existe
      if (content.includes(` ${f.name}:`)) continue

      // Adiciona a coluna
      newDeclarations += `\n  @column()\n  declare ${f.name}: ${this.tsType(f)}`

      // Se for relação, adiciona a declaração belongsTo
      if (f.isRelation && f.relationModel) {
        const relationName = f.name.endsWith('_id') ? f.name.slice(0, -3) : f.name
        newDeclarations += `\n  @belongsTo(() => ${f.relationModel}, {
          foreignKey: '${f.name}'
        })\n  declare ${relationName}: BelongsTo<typeof ${f.relationModel}>`
      }
    }

    // Insere as novas declarações antes do último '}' da classe
    if (newDeclarations) {
      const lastBraceIndex = content.lastIndexOf('\n}')
      if (lastBraceIndex !== -1) {
        content = content.slice(0, lastBraceIndex) + newDeclarations + content.slice(lastBraceIndex)
        fs.writeFileSync(file, content)
        this.logger.action(`updated ${file}`).succeeded()
      }
    }
  }

  // ================= DTO =================
  private updateDTO(modelPascal: string, modelLower: string, fields: Field[]) {
    const file = `app/dtos/${modelLower}_dto.ts`
    if (!fs.existsSync(file)) return

    let content = fs.readFileSync(file, 'utf8')
    let modified = false

    for (const f of fields) {
      // Verifica se o campo já existe nas interfaces (considerando opcional)
      const fieldPattern = new RegExp(`\\s+${f.name}\\??:`)
      if (fieldPattern.test(content)) continue

      // Adiciona no CreateDTO (obrigatório ou opcional)
      const createRegex = new RegExp(`(Create${modelPascal}DTO\\s*{)`)
      const createMatch = content.match(createRegex)
      if (createMatch) {
        const newField = `\n  ${f.name}: ${this.tsType(f)}${f.optional ? '?' : ''},`
        content = content.replace(createRegex, createMatch[1] + newField)
        modified = true
      }

      // Adiciona no UpdateDTO (sempre opcional)
      const updateRegex = new RegExp(`(Update${modelPascal}DTO\\s*{)`)
      const updateMatch = content.match(updateRegex)
      if (updateMatch) {
        const newField = `\n  ${f.name}?: ${this.tsType(f)},`
        content = content.replace(updateRegex, updateMatch[1] + newField)
        modified = true
      }
    }

    if (modified) {
      fs.writeFileSync(file, content)
      this.logger.action(`updated ${file}`).succeeded()
    }
  }

  // ================= VALIDATOR =================
  private updateValidator(modelPascal: string, modelLower: string, fields: Field[]) {
    const file = `app/validators/${modelLower}_validator.ts`
    if (!fs.existsSync(file)) return

    let content = fs.readFileSync(file, 'utf8')
    let modified = false

    // Lista de possíveis nomes para os validators (create e update)
    const variations = [
      modelPascal, // Papel
      modelPascal.toLowerCase(), // papel
      modelPascal.toUpperCase(), // PAPEL
    ]

    const processValidator = (type: 'create' | 'update') => {
      for (const variant of variations) {
        const constName = `${type}${variant}Validator`
        // Regex para capturar todo o conteúdo dentro de vine.object({ ... })
        // Funciona mesmo se estiver vazio ou com múltiplas linhas
        const regex = new RegExp(
          `(export\\s+const\\s+${constName}\\s*=\\s*vine\\.compile\\(\\s*vine\\.object\\(\\{)([\\s\\S]*?)(\\}\\)\\))`,
          'm'
        )
        const match = content.match(regex)
        if (match) {
          const [fullMatch, prefix, body, suffix] = match
          // Verifica quais campos já existem no body
          const existingFields = new Set<string>()
          for (const line of body.split('\n')) {
            const fieldMatch = line.match(/^\s*(\w+?)\??:/)
            if (fieldMatch) existingFields.add(fieldMatch[1])
          }

          // Constrói as regras para os campos que ainda não existem
          let newRules = ''
          for (const f of fields) {
            if (!existingFields.has(f.name)) {
              newRules += `\n    ${f.name}: ${this.vineRule(f)}${type === 'update' ? '.optional()' : ''},`
            }
          }

          if (newRules) {
            // Insere as novas regras no body (antes do fechamento '}')
            // Se o body estiver vazio (só espaços), substitui por newRules sem o \n extra
            const trimmedBody = body.trim()
            let newBody
            if (trimmedBody === '') {
              newBody = newRules.trimStart() // remove o \n inicial se houver
            } else {
              newBody = body + newRules
            }
            const newFull = prefix + newBody + suffix
            content = content.replace(fullMatch, newFull)
            modified = true
          }
          return true // encontrou o validator, não precisa testar outras variações
        }
      }
      return false // não encontrou nenhuma variação
    }

    processValidator('create')
    processValidator('update')

    if (modified) {
      fs.writeFileSync(file, content)
      this.logger.action(`updated ${file}`).succeeded()
    } else {
      this.logger.info(`Nenhuma alteração necessária em ${file}`)
    }
  }

  // ================= MIGRATION =================
  private createMigration(table: string, fields: Field[]) {
    const file = `database/migrations/${Date.now()}_alter_${table}.ts`

    const lines: string[] = []
    for (const f of fields) {
      lines.push(...this.schemaFieldLines(f))
    }

    const migrationContent = `
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = '${table}'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
${lines.map((l) => '      ' + l).join('\n')}
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {
    })
  }
}
`.trim()

    fs.writeFileSync(file, migrationContent)
    this.logger.action('created').succeeded()
  }

  // ================= HELPERS =================

  private tsType(f: Field): string {
    if (f.isRelation) return 'string'
    if (f.type === 'integer') return 'number'
    if (f.type === 'decimal') return 'number'
    if (f.type === 'double') return 'number'
    if (f.type === 'float') return 'number'
    if (f.type === 'number') return 'number'
    if (f.type === 'boolean') return 'boolean'
    if (f.type === 'date') return 'Date'
    if (f.type === 'datetime') return 'Date'
    if (f.type === 'json') return 'Record<string, any>'
    if (f.type === 'photo' || f.type === 'text_file' || f.type === 'video') return 'string'
    if (f.type === 'email' || f.type === 'password') return 'string'
    if (f.type === 'uuid') return 'string'
    return 'string'
  }

  private vineRule(f: Field): string {
    if (f.isRelation) {
      //console.log('passing throught relation')
      return `vine.string().trim().escape().exists(async (db,value,__)=>{ const exists = await db.from('${f.relationModel!.toLowerCase()}').where('id', value).first(); return exists !== undefined; })`
    }

    switch (f.type) {
      case 'datetime':
        return 'vine.date(({ formats: ["iso8601"]}))'
      case 'number':
        return 'vine.number()'
      case 'decimal':
        return 'vine.number().decimal(30,)'
      case 'float':
        return 'vine.number().decimal(30,)'
      case 'integer':
        return 'vine.number()'
      case 'double':
        return 'vine.number().decimal(30,)'
      case 'boolean':
        return 'vine.boolean()'
      case 'email':
        return 'vine.string().trim().email()'
      case 'password':
        return 'vine.string().trim().escape().minLength(6)'
      case 'date':
        return 'vine.date(({ formats: ["iso8601"]}))'
      case 'datetime':
        return 'vine.date(({ formats: ["iso8601"]}))'
      case 'uuid':
        return 'vine.string().trim().uuid()'
      case 'json':
        return 'vine.object()'
      case 'photo':
        return 'vine.file({ size: "25mb", extnames: ["jpg", "jpeg", "png", "gif"] }).transform((file) => { const fileName = `${randomUUID()}.${file.extname}`; file.move("uploads", { name: fileName, overwrite: true }); return fileName; })'
      case 'text_file':
        return 'vine.file({ size: "5mb", extnames: ["txt", "md", "csv", "json", "xml", "pdf"] }).transform((file) => { const fileName = `${randomUUID()}.${file.extname}`; file.move("uploads", { name: fileName, overwrite: true }); return fileName; })'
      case 'video':
        return 'vine.file({ size: "100mb", extnames: ["mp4", "avi", "mov", "wmv"] }).transform((file) => { const fileName = `${randomUUID()}.${file.extname}`; file.move("uploads", { name: fileName, overwrite: true }); return fileName; })'
      default:
        return 'vine.string().trim().escape()'
    }
  }

  private schemaFieldLines(f: Field): string[] {
    const lines: string[] = []

    if (f.isRelation && f.relationModel) {
      const colType = 'uuid'
      const nullable = f.optional ? '.nullable()' : ''
      lines.push(`table.${colType}('${f.name}')${nullable};`)

      const referencedTable = f.relationModel.toLowerCase()
      const onDelete = f.optional ? 'SET NULL' : 'CASCADE'
      lines.push(
        `table.foreign('${f.name}').references('id').inTable('${referencedTable}').onDelete('${onDelete}');`
      )
    } else {
      let colType = 'string'
      if (f.type === 'number') colType = 'integer'
      else if (f.type === 'integer') colType = 'integer'
      else if (f.type === 'decimal') colType = 'decimal'
      else if (f.type === 'float') colType = 'decimal'
      else if (f.type === 'photo') colType = 'string'
      else if (f.type === 'video') colType = 'string'
      else if (f.type === 'image') colType = 'string'
      else if (f.type === 'json') colType = 'json'
      else if (f.type === 'date') colType = 'date'
      else if (f.type === 'datetime') colType = 'datetime'
      else if (f.type === 'boolean') colType = 'boolean'

      const nullable = f.optional ? '.nullable()' : ''
      lines.push(`table.${colType}('${f.name}')${nullable};`)
    }

    return lines
  }
}
