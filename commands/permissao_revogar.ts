import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import Papel from '#models/auth/papel'
import {
  ehPapelCritico,
  resolverPermissoes,
  revogarPermissao,
  type ModoPermissao,
} from '../app/helpers/rbac_permissoes.js'

/**
 * Retira permissões a papéis. Par simétrico de `permissao:conceder` — mesma forma de
 * indicar o alvo, mesmos modos.
 *
 *   node ace permissao:revogar domain_vendapagamento.destroy Vendedor
 *   node ace permissao:revogar domain_vendapagamento --escrita Vendedor Gerente
 *   node ace permissao:revogar domain_cupom,domain_cliente --tudo VendedorVisualizador
 *
 * Duas salvaguardas, porque isto tira acessos a pessoas que estão a trabalhar:
 *
 * - `--simular` mostra exactamente o que sairia, sem gravar. Use-o primeiro.
 * - `Admin`/`Platform_Admin` exigem `--forcar`: são os papéis que atribuem permissões aos
 *   outros; tirar-lhes acesso pode deixar a empresa (ou a plataforma) sem ninguém capaz de
 *   o repor pela aplicação.
 *
 * A permissão em si NUNCA é apagada do catálogo, nem os outros papéis são tocados — sai
 * apenas a associação papel↔permissão indicada.
 */
export default class PermissaoRevogar extends BaseCommand {
  static commandName = 'permissao:revogar'
  static description =
    'Retira permissões a papéis (nome exacto, ou recurso + --leitura/--escrita/--tudo)'
  static options = { startApp: true }

  @args.string({
    description: 'Permissão (domain_x.store) ou recurso (domain_x) com --leitura/--escrita/--tudo. Vários: separados por vírgula',
  })
  declare alvo: string

  @args.spread({ description: 'Papéis a perder as permissões, ex.: Vendedor Gerente' })
  declare papeis: string[]

  @flags.boolean({ description: 'Só leitura do recurso (.index .show)' })
  declare leitura?: boolean

  @flags.boolean({ description: 'Só escrita do recurso (.store .update .destroy)' })
  declare escrita?: boolean

  @flags.boolean({ description: 'Tudo o que o recurso tenha, incluindo acções próprias' })
  declare tudo?: boolean

  @flags.boolean({ description: 'Mostra o que faria, sem gravar nada' })
  declare simular?: boolean

  @flags.boolean({ description: 'Necessário para mexer em Admin/Platform_Admin' })
  declare forcar?: boolean

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
      this.logger.error('Indique pelo menos um papel. Ex.: node ace permissao:revogar x.y Vendedor')
      this.exitCode = 1
      return
    }

    const modo = this.modo()
    if (modo === 'conflito') {
      this.logger.error('Escolha só um de --leitura, --escrita ou --tudo.')
      this.exitCode = 1
      return
    }

    const criticos = this.papeis.filter(ehPapelCritico)
    if (criticos.length && !this.forcar && !this.simular) {
      this.logger.error(
        `${criticos.join(', ')}: é destes papéis que se atribuem permissões aos outros. ` +
          'Confirme com --simular e, se for mesmo isso, repita com --forcar.'
      )
      this.exitCode = 1
      return
    }

    const alvos = this.alvo.split(',').map((a) => a.trim()).filter(Boolean)
    const { permissoes, inexistentes, foraDoModo } = await resolverPermissoes(alvos, modo)

    if (inexistentes.length) {
      this.logger.info(`Não existem no catálogo (ignoradas): ${inexistentes.join(', ')}`)
    }
    if (foraDoModo.length) {
      this.logger.warning(
        `Acções próprias fora de --${modo}, MANTIDAS: ${foraDoModo.join(', ')} — retire-as pelo nome ou use --tudo.`
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
    for (const nomePapel of this.papeis) {
      const papel = await Papel.findBy('nome', nomePapel)
      if (!papel) {
        this.logger.warning(`Papel inexistente, ignorado: ${nomePapel}`)
        continue
      }

      for (const permissao of permissoes) {
        if (this.simular) {
          this.logger.info(`[simulação] ${nomePapel}: perderia ${permissao.nome}`)
          continue
        }

        const resultado = await revogarPermissao(papel, permissao)
        if (resultado === 'não tinha') {
          this.logger.info(`${nomePapel}: não tinha ${permissao.nome}`)
        } else {
          alteracoes++
          this.logger.success(`${nomePapel}: ${permissao.nome} removida`)
        }
      }
    }

    if (!this.simular) {
      this.logger.info(alteracoes ? `${alteracoes} permissão(ões) retirada(s).` : 'Nada mudou.')
    }
  }
}
