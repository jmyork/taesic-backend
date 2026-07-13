import { BaseCommand, args } from '@adonisjs/core/ace'
import fs from 'node:fs'

export default class ResourceRemoveField extends BaseCommand {
  static commandName = 'resource:remove-field'
  static description =
    'Remove um ou mais campos de um recurso (model, DTO, validator e gera migration de remoção)'

  @args.string({ description: 'Assinatura no formato Modelo:campo1,campo2' })
  declare signature: string

  async run() {
    const { modelPascal, modelLower, fields } = this.parse(this.signature)

    if (fields.length === 0) {
      this.logger.error('Nenhum campo informado')
      return
    }

    const table = modelLower

    // Verifica se o recurso existe
    if (!fs.existsSync(`app/models/${modelPascal}.ts`)) {
      this.logger.error(`Modelo ${modelPascal} não encontrado`)
      return
    }

    this.logger.info(`Removendo campos de ${modelPascal}: ${fields.join(', ')}`)

    this.removeFromModel(modelPascal, fields)
    this.removeFromDTO(modelPascal, modelLower, fields)
    this.removeFromValidator(modelPascal, modelLower, fields)
    this.createMigration(table, fields)

    this.logger.success(
      'Campos removidos. Execute a migration para aplicar as alterações no banco.'
    )
  }

  // ================= PARSER =================
  private parse(sig: string): { modelPascal: string; modelLower: string; fields: string[] } {
    const [modelPart, fieldsPart] = sig.split(':')
    if (!modelPart || !fieldsPart) {
      this.logger.error('Formato inválido. Use Modelo:campo1,campo2')
      process.exit(1)
    }
    const modelPascal = modelPart.toLowerCase()
    const modelLower = modelPascal.toLowerCase()
    const fields = fieldsPart
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
    return { modelPascal, modelLower, fields }
  }

  // ================= MODEL =================
  private removeFromModel(model: string, fields: string[]) {
    const file = `app/models/${model}.ts`
    if (!fs.existsSync(file)) return

    let content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    const newLines: string[] = []
    let removed = false
    let skipLine = false

    for (let i = 0; i < lines.length; i++) {
      if (skipLine) {
        skipLine = false
        continue
      }

      const line = lines[i]
      const nextLine = lines[i + 1] || ''

      // Verifica se a linha atual é um decorator (@column ou @belongsTo) e a próxima é a declaração do campo
      const isDecorator = /^\s*@(column|belongsTo)/.test(line)
      if (isDecorator) {
        const fieldDeclMatch = nextLine.match(/^\s*declare\s+(\w+)\s*:/)
        if (fieldDeclMatch) {
          const fieldName = fieldDeclMatch[1]
          if (fields.includes(fieldName)) {
            // Remove o decorator e a declaração do campo
            skipLine = true // pula a próxima linha (declaração)
            removed = true
            continue // não adiciona o decorator
          }
        } else {
          // Pode ser um decorator que não é seguido de declaração? Raro, mas adiciona
          newLines.push(line)
        }
      } else {
        // Verifica se a linha é uma declaração de campo sem decorator na linha anterior (improvável)
        const fieldDeclMatch = line.match(/^\s*declare\s+(\w+)\s*:/)
        if (fieldDeclMatch) {
          const fieldName = fieldDeclMatch[1]
          if (fields.includes(fieldName)) {
            removed = true
            continue
          }
        }

        // Verifica se é uma declaração de relação (declare nome: BelongsTo<...>)
        const relationMatch = line.match(/^\s*declare\s+(\w+)\s*:\s*BelongsTo</)
        if (relationMatch) {
          const relName = relationMatch[1]
          for (const field of fields) {
            if (field.endsWith('_id') && field.slice(0, -3) === relName) {
              removed = true
              // Remover também o decorator @belongsTo da linha anterior, se existir
              if (newLines.length > 0 && /^\s*@belongsTo/.test(newLines[newLines.length - 1])) {
                newLines.pop()
              }
              continue
            }
          }
        }

        newLines.push(line)
      }
    }

    if (removed) {
      fs.writeFileSync(file, newLines.join('\n'))
      this.logger.action(`updated ${file}`).succeeded()
    } else {
      this.logger.warning(`Nenhum campo removido do model ${model} (campos não encontrados)`)
    }
  }

  // ================= DTO =================
  private removeFromDTO(modelPascal: string, modelLower: string, fields: string[]) {
    // Tenta encontrar o arquivo DTO: primeiro com PascalCase, depois com minúsculo
    let file = `app/dtos/${modelPascal}_dto.ts`
    if (!fs.existsSync(file)) {
      file = `app/dtos/${modelLower}_dto.ts`
      if (!fs.existsSync(file)) return
    }

    let content = fs.readFileSync(file, 'utf8')
    let modified = false

    // Função para remover campos de uma interface
    const processInterface = (interfaceName: string) => {
      const regex = new RegExp(`(export\\s+interface\\s+${interfaceName}\\s*{)([\\s\\S]*?)}`, 'm')
      const match = content.match(regex)
      if (!match) return

      const [fullMatch, open, body] = match
      const newBody = this.removeFieldsFromDTOBody(body, fields)
      if (newBody !== body) {
        content = content.replace(fullMatch, open + newBody + '}')
        modified = true
      }
    }

    processInterface(`Create${modelPascal}DTO`)
    processInterface(`Update${modelPascal}DTO`)

    if (modified) {
      fs.writeFileSync(file, content)
      this.logger.action(`updated ${file}`).succeeded()
    } else {
      this.logger.info(`Nenhuma alteração necessária em ${file}`)
    }
  }

  private removeFieldsFromDTOBody(body: string, fields: string[]): string {
    // Divide o corpo em linhas, mas também trata o caso de tudo estar em uma linha
    const lines = body.split('\n')
    const newLines: string[] = []

    for (let line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        newLines.push(line)
        continue
      }

      // Verifica se a linha contém um ou mais campos
      // Exemplos: "  nome: string," ou "  nome: string, idade: number,"
      // Vamos dividir por vírgula e processar cada parte
      const parts = trimmed
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
      const newParts = parts.filter((part) => {
        // Extrai o nome do campo (antes dos dois pontos)
        const fieldMatch = part.match(/^(\w+)\??:/)
        if (!fieldMatch) return true // mantém se não for uma definição de campo (improvável)
        const fieldName = fieldMatch[1]
        return !fields.includes(fieldName)
      })

      if (newParts.length === 0) {
        // Linha inteira removida
        continue
      } else if (newParts.length === parts.length) {
        // Nenhum campo removido, mantém a linha original
        newLines.push(line)
      } else {
        // Reconstroi a linha com os campos restantes
        const newLine = '  ' + newParts.join(', ') + (newParts.length > 0 ? ',' : '')
        newLines.push(newLine)
      }
    }

    return newLines.join('\n')
  }

  // ================= VALIDATOR =================
  private removeFromValidator(modelPascal: string, modelLower: string, fields: string[]) {
    const file = `app/validators/${modelLower}_validator.ts`
    if (!fs.existsSync(file)) return

    let content = fs.readFileSync(file, 'utf8')
    let modified = false

    const variations = [modelPascal, modelPascal.toLowerCase(), modelPascal.toUpperCase()]

    const processValidator = (type: 'create' | 'update') => {
      for (const variant of variations) {
        const constName = `${type}${variant}Validator`
        const regex = new RegExp(
          `(export\\s+const\\s+${constName}\\s*=\\s*vine\\.compile\\(\\s*vine\\.object\\(\\{)([\\s\\S]*?)(\\}\\)\\))`,
          'm'
        )
        const match = content.match(regex)
        if (match) {
          const [fullMatch, prefix, body, suffix] = match
          const newBody = this.removeFieldsFromVineBody(body, fields)
          if (newBody !== body) {
            content = content.replace(fullMatch, prefix + newBody + suffix)
            modified = true
          }
          return true
        }
      }
      return false
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

  private removeFieldsFromVineBody(body: string, fields: string[]): string {
    const lines = body.split('\n')
    const newLines = lines.filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      for (const field of fields) {
        // Procura por "campo: vine...." no início da linha
        const fieldPattern = new RegExp(`^\\s*${field}\\s*:`)
        if (fieldPattern.test(trimmed)) {
          return false
        }
      }
      return true
    })
    return newLines.join('\n')
  }

  // ================= MIGRATION =================
  private createMigration(table: string, fields: string[]) {
    const timestamp = Date.now()
    const fileName = `database/migrations/${timestamp}_remove_fields_${table}.ts`

    const upLines: string[] = []
    const downLines: string[] = []

    for (const field of fields) {
      if (field.endsWith('_id')) {
        upLines.push(`      table.dropForeign('${field}')`)
      }
      upLines.push(`      table.dropColumn('${field}')`)
      downLines.push(
        `      // table.${this.inferColumnType(field)}('${field}').nullable() // Recrie manualmente`
      )
    }

    const migrationContent = `
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = '${table}'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
${upLines.join('\n')}
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
${downLines.join('\n')}
    })
  }
}
`.trim()

    fs.writeFileSync(fileName, migrationContent)
    this.logger.action(`created ${fileName}`).succeeded()
  }

  // ================= HELPERS =================
  private inferColumnType(field: string): string {
    if (field.endsWith('_id')) return 'uuid'
    if (field.includes('count') || field.includes('age') || field.includes('price'))
      return 'integer'
    if (field.includes('is_') || field.includes('has_') || field.includes('active'))
      return 'boolean'
    if (field.includes('date') || field.includes('created_at') || field.includes('updated_at'))
      return 'timestamp'
    return 'string'
  }
}
