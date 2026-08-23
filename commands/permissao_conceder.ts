import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import Permissao from '#models/auth/permissao'
import {
  concederPermissao,
  resolverPermissoes,
  type ModoPermissao,
  resolverPapeisPorNome,
} from '../app/helpers/rbac_permissoes.js'

/**
 * Atribui permissões a papéis, de forma idempotente. Par simétrico de `permissao:revogar`.
 *
 * Porque foi preciso: o `database_seeder` usa `createMany` sem deduplicar, ou seja, só pode
 * correr numa base limpa (`db:fresh:seed`). Consequência prática: acrescentar UMA permissão nova
 * obrigava a destruir a base de dados — impossível em produção, e indesejável em desenvolvimento
 * com dados reais. Sem isto, qualquer funcionalidade nova protegida por permissão fica por
 * entregar: passa nos testes (que correm sobre uma base recriada) e não funciona na aplicação
 * a correr.
 *
 * Duas formas de indicar o alvo:
 *
 *   1. Pelo NOME EXACTO (cria a permissão se ainda não existir, com `--descricao`):
 *      node ace permissao:conceder domain_cupom.validar Admin Vendedor
 *
 *   2. Pelo RECURSO + o que se quer dar (só mexe em permissões que já existem):
 *      node ace permissao:conceder domain_vendapagamento --leitura Vendedor Gerente
 *      node ace permissao:conceder domain_vendapagamento --escrita Vendedor
 *      node ace permissao:conceder domain_vendapagamento --tudo    Admin
 *
 *   --leitura  = .index .show
 *   --escrita  = .store .update .destroy
 *   --tudo     = tudo o que o recurso tenha, incluindo acções próprias (.catalogo, .anular, ...)
 *
 * Vários recursos de uma vez, separados por vírgula; `--simular` mostra o que faria sem gravar:
 *      node ace permissao:conceder domain_cupom,domain_cliente --leitura Vendedor --simular
 *
 * Correr duas vezes é seguro: a segunda não muda nada.
 *
 * ── Âmbito (desde que os papéis passaram a ser por empresa) ──────────────────────
 *
 * Um nome de papel já não identifica um papel: há uma cópia por empresa, mais o
 * modelo que é clonado nos registos novos. Sem indicar nada, o comando age sobre os
 * papéis do dono da plataforma (`modelo` e `plataforma`) — que é o que se quer para
 * afinar o padrão.
 *
 * ATENÇÃO ao que isso significa: mexer no modelo só afecta empresas criadas A PARTIR
 * DE ENTÃO. As que já existem têm as suas cópias e não mudam. Para lá chegar:
 *
 *   --todas-empresas    a cópia deste papel em todas as empresas
 *   --empresa <alias>   só os papéis dessa empresa
 *
 * É esta a linha a usar quando uma regra de negócio nova exige uma permissão nova em
 * produção — a alternativa é os inquilinos já registados ficarem com um 403 que
 * ninguém relaciona com a causa. Já aconteceu três vezes neste projecto com o
 * catálogo mantido à mão (ver CLAUDE.md 7.6, 7.8 e 7.12).
 */
export default class PermissaoConceder extends BaseCommand {
  static commandName = 'permissao:conceder'
  static description =
    'Atribui permissões a papéis (nome exacto, ou recurso + --leitura/--escrita/--tudo), sem duplicar'
  static options = { startApp: true }

  @args.string({
    description: 'Permissão (domain_x.store) ou recurso (domain_x) com --leitura/--escrita/--tudo. Vários: separados por vírgula',
  })
  declare alvo: string

  @args.spread({ description: 'Papéis a receber as permissões, ex.: Admin Vendedor' })
  declare papeis: string[]

  @flags.boolean({ description: 'Só leitura do recurso (.index .show)' })
  declare leitura?: boolean

  @flags.boolean({ description: 'Só escrita do recurso (.store .update .destroy)' })
  declare escrita?: boolean

  @flags.boolean({ description: 'Tudo o que o recurso tenha, incluindo acções próprias' })
  declare tudo?: boolean

  @flags.boolean({ description: 'Mostra o que faria, sem gravar nada' })
  declare simular?: boolean

  @flags.string({
    description: 'Aplicar aos papéis DESTA empresa (company_alias), em vez dos da plataforma',
  })
  declare empresa?: string

  @flags.boolean({
    description: 'Aplicar à cópia deste papel em TODAS as empresas',
  })
  declare todasEmpresas?: boolean

  @flags.string({ description: 'Descrição a usar caso a permissão ainda não exista (só com nome exacto)' })
  declare descricao?: string

  /** Qual dos três modos foi pedido — e recusa se pedirem mais do que um. */
  private modo(): ModoPermissao | undefined | 'conflito' {
    const pedidos = [
      this.leitura ? 'leitura' : null,
      this.escrita ? 'escrita' : null,
      this.tudo ? 'tudo' : null,
    ].filter(Boolean) as ModoPermissao[]

    if (pedidos.length > 1) return 'conflito'
    return pedidos[0]
  }

  async run() {
    if (!this.papeis?.length) {
      this.logger.error('Indique pelo menos um papel. Ex.: node ace permissao:conceder x.y Admin')
      this.exitCode = 1
      return
    }

    const modo = this.modo()
    if (modo === 'conflito') {
      this.logger.error('Escolha só um de --leitura, --escrita ou --tudo.')
      this.exitCode = 1
      return
    }

    const alvos = this.alvo.split(',').map((a) => a.trim()).filter(Boolean)
    const { permissoes, inexistentes, foraDoModo } = await resolverPermissoes(alvos, modo)

    // Sem modo, o alvo é um nome exacto — e aí (e só aí) faz sentido criar o que falta:
    // com um recurso + modo não há nome nenhum para inventar sem adivinhar.
    if (!modo) {
      for (const nome of inexistentes) {
        if (this.simular) {
          this.logger.info(`[simulação] criaria a permissão: ${nome}`)
          continue
        }
        permissoes.push(
          await Permissao.create({ nome, descricao: this.descricao ?? nome } as any)
        )
        this.logger.success(`Permissão criada: ${nome}`)
      }
    } else if (inexistentes.length) {
      this.logger.info(`Não existem neste recurso (ignoradas): ${inexistentes.join(', ')}`)
    }

    if (foraDoModo.length) {
      this.logger.warning(
        `Acções próprias fora de --${modo}: ${foraDoModo.join(', ')} — conceda-as pelo nome ou use --tudo.`
      )
    }

    if (!permissoes.length) {
      this.logger.error('Nenhuma permissão corresponde ao pedido — nada a fazer.')
      this.exitCode = 1
      return
    }

    this.logger.info(
      `${permissoes.length} permissão(ões) x ${this.papeis.length} papel(éis)${this.simular ? ' [simulação]' : ''}`
    )

    let alteracoes = 0
    const { resolvidos, inexistentes: papeisInexistentes } = await resolverPapeisPorNome(
      this.papeis,
      { empresa: this.empresa, todasEmpresas: this.todasEmpresas }
    )

    for (const nome of papeisInexistentes) {
      this.logger.warning(`Papel inexistente neste âmbito, ignorado: ${nome}`)
    }

    for (const { papel, etiqueta: nomePapel } of resolvidos) {

      for (const permissao of permissoes) {
        if (this.simular) {
          this.logger.info(`[simulação] ${nomePapel}: ${permissao.nome}`)
          continue
        }

        const resultado = await concederPermissao(papel, permissao)
        if (resultado === 'já tinha') {
          this.logger.info(`${nomePapel}: já tinha ${permissao.nome}`)
        } else {
          alteracoes++
          this.logger.success(`${nomePapel}: ${permissao.nome} ${resultado}`)
        }
      }
    }

    if (!this.simular) {
      this.logger.info(alteracoes ? `${alteracoes} atribuição(ões) nova(s).` : 'Nada mudou.')
    }
  }
}
