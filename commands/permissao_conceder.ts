import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import Papel from '#models/auth/papel'
import Permissao from '#models/auth/permissao'
import papel_permissao from '#models/auth/papel_permissao'

/**
 * Cria uma permissão (se não existir) e atribui-a a papéis, de forma idempotente.
 *
 * Porque foi preciso: o `database_seeder` usa `createMany` sem deduplicar, ou seja, só pode
 * correr numa base limpa (`db:fresh:seed`). Consequência prática: acrescentar UMA permissão nova
 * obrigava a destruir a base de dados — impossível em produção, e indesejável em desenvolvimento
 * com dados reais. Sem isto, qualquer funcionalidade nova protegida por permissão fica por
 * entregar: passa nos testes (que correm sobre uma base recriada) e não funciona na aplicação
 * a correr.
 *
 * Exemplo:
 *   node ace permissao:conceder domain_cupom.validar Admin Vendedor Gerente Supervisor \
 *     --descricao="Validar um código de cupão ao fechar uma venda"
 *
 * Correr duas vezes é seguro: a segunda não muda nada.
 */
export default class PermissaoConceder extends BaseCommand {
  static commandName = 'permissao:conceder'
  static description =
    'Cria uma permissão (se não existir) e atribui-a aos papéis indicados, sem duplicar'
  static options = { startApp: true }

  @args.string({ description: 'Nome da permissão, ex.: domain_cupom.validar' })
  declare permissao: string

  @args.spread({ description: 'Papéis a receber a permissão, ex.: Admin Vendedor' })
  declare papeis: string[]

  @flags.string({ description: 'Descrição a usar caso a permissão ainda não exista' })
  declare descricao?: string

  async run() {
    if (!this.papeis?.length) {
      this.logger.error('Indique pelo menos um papel. Ex.: node ace permissao:conceder x.y Admin')
      this.exitCode = 1
      return
    }

    let permissao = await Permissao.findBy('nome', this.permissao)
    if (!permissao) {
      permissao = await Permissao.create({
        nome: this.permissao,
        descricao: this.descricao ?? this.permissao,
      } as any)
      this.logger.success(`Permissão criada: ${this.permissao}`)
    } else {
      this.logger.info(`Permissão já existe: ${this.permissao}`)
    }

    for (const nomePapel of this.papeis) {
      const papel = await Papel.findBy('nome', nomePapel)
      if (!papel) {
        this.logger.warning(`Papel inexistente, ignorado: ${nomePapel}`)
        continue
      }

      const jaTem = await papel_permissao
        .query()
        .where('papel_id', papel.id)
        .where('permissao_id', permissao.id)
        .first()

      if (jaTem) {
        this.logger.info(`${nomePapel}: já tinha`)
        continue
      }

      await papel_permissao.create({ papel_id: papel.id, permissao_id: permissao.id })
      this.logger.success(`${nomePapel}: atribuída`)
    }
  }
}
