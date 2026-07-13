import { BaseCommand, args } from '@adonisjs/core/ace'
import fs from 'node:fs'
import path from 'node:path'

export default class RemoveEnterpriseResource extends BaseCommand {
  static commandName = 'remove:enterprise:resource'

  @args.spread()
  declare names: string[]

  async run() {
    if (!this.names.length) {
      this.logger.error('Informe ao menos um nome')
      return
    }

    for (const Name of this.names) {
      const name = Name.toLowerCase()
      const plural = name
      const table = plural

      this.logger.info(`removendo recurso: ${Name}`)

      // Model
      this.deleteFile(`app/models/${Name}.ts`)

      // Migration (procura por qualquer migration que termine com _${table}.ts)
      this.deleteMigrations(table)

      // DTO
      this.deleteFile(`app/dtos/${Name}_dto.ts`)

      // Validator
      this.deleteFile(`app/validators/${Name}_validator.ts`)

      // Repository
      this.deleteFile(`app/repositories/${Name}_repository.ts`)

      // Service
      this.deleteFile(`app/services/${Name}_service.ts`)

      // Controller
      this.deleteFile(`app/controllers/${plural}_controller.ts`)

      // Rota no arquivo start/routes.ts
      this.removeRoute(plural)
    }

    this.logger.success('Recursos removidos.')
  }

  /**
   * Remove um arquivo se ele existir.
   */
  private deleteFile(filePath: string) {
    const fullPath = path.join(process.cwd(), filePath)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      this.logger.action('deleted') //.succeeded(filePath)
    } else {
      this.logger.warning(`Arquivo não encontrado: ${filePath}`)
    }
  }

  /**
   * Remove todas as migrations que correspondem ao nome da tabela.
   * Exemplo: se table = 'user', remove database/migrations/*_users.ts
   */
  private deleteMigrations(table: string) {
    const migrationsDir = path.join(process.cwd(), 'database/migrations')
    if (!fs.existsSync(migrationsDir)) return

    const files = fs.readdirSync(migrationsDir)
    const pattern = new RegExp(`_${table}\\.ts$`) // termina com _users.ts
    const toDelete = files.filter((file) => pattern.test(file))

    for (const file of toDelete) {
      const filePath = path.join(migrationsDir, file)
      fs.unlinkSync(filePath)
      this.logger.action('deleted') //.succeeded(`database/migrations/${file}`)
    }

    if (toDelete.length === 0) {
      this.logger.warning(`Nenhuma migration encontrada para a tabela '${table}'`)
    }
  }

  /**
   * Remove a linha do router.resource referente ao plural do recurso.
   */
  private removeRoute(plural: string) {
    const routesFile = path.join(process.cwd(), 'start/routes.ts')
    if (!fs.existsSync(routesFile)) return

    let content = fs.readFileSync(routesFile, 'utf8')
    const lines = content.split('\n')

    // Expressão regular para encontrar a linha exata da rota
    // Aceita aspas simples ou duplas e espaços extras
    const routePattern = new RegExp(`^\\s*router\\.resource\\s*\\(\\s*['"]${plural}['"]\\s*,`, 'i')

    const newLines = lines.filter((line) => !routePattern.test(line))

    if (newLines.length !== lines.length) {
      fs.writeFileSync(routesFile, newLines.join('\n'))
      this.logger.action('updated') //.succeeded(`start/routes.ts (linha removida)`)
    } else {
      this.logger.warning(`Nenhuma rota encontrada para '${plural}' em start/routes.ts`)
    }
  }
}
