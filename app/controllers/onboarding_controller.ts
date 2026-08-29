import type { HttpContext } from '@adonisjs/core/http'
import onboardingService from '#services/onboarding_service'
import { aplicarRamosValidator } from '#validators/onboarding_validator'
import { RAMOS_DE_ACTUACAO, ramoPorId } from '../helpers/ramos_de_actuacao.js'
import { resumirRamo } from '#dtos/onboarding_dto'

/**
 * Os passos do onboarding de uma empresa.
 *
 * Sem try/catch a reclassificar erros: `app/exceptions/handler.ts` já traduz
 * `E_ROW_NOT_FOUND` (404) e os erros do VineJS (400) de forma consistente — ver a secção
 * "Erros/excepções" do CLAUDE.md.
 */
export default class OnboardingController {
  private service = new onboardingService()

  /** Estado do onboarding desta empresa + catálogo de ramos. É o primeiro pedido do ecrã. */
  async estado({ params }: HttpContext) {
    const data = await this.service.estado(params.company_alias)
    return { data, message: 'Estado do onboarding obtido com sucesso', status: 200 }
  }

  /**
   * Só o catálogo de ramos, sem tocar na base de dados.
   *
   * Existe à parte de `estado` porque o passo dos ramos pode ser reaberto a partir das
   * definições, muito depois do onboarding, e aí o resto do estado não interessa.
   */
  async ramos({}: HttpContext) {
    return {
      data: RAMOS_DE_ACTUACAO.map(resumirRamo),
      message: 'Listagem realizada com sucesso',
      status: 200,
    }
  }

  /**
   * Grava os ramos escolhidos e semeia as categorias e os produtos de exemplo deles.
   *
   * O caminho continua a ser `POST onboarding/ramo`, no singular, apesar de o corpo ser
   * agora uma lista: o nome da rota (`domain_onboarding.ramo`) é a chave da permissão no
   * RBAC, já concedida em todos os ambientes. Renomeá-lo obrigaria a repetir o
   * `permissao:conceder --todas-empresas` (secção 7.13) por uma questão de estética, e é
   * exactamente assim que uma empresa fica com um 403 que ninguém relaciona com a causa.
   */
  async aplicarRamos({ params, request }: HttpContext) {
    const payload = await request.validateUsing(aplicarRamosValidator)

    // O validador garante que vem um ou outro; aqui só se normaliza para lista.
    const escolhidos = payload.ramos ?? [payload.ramo!]

    const resultado = await this.service.aplicarRamos({
      company_alias: params.company_alias,
      ramos: escolhidos,
    })

    return {
      data: resultado,
      // O que foi criado, em português e por números — quem escolheu os ramos tem de saber
      // o que apareceu no catálogo, senão a lista de produtos muda sozinha sem explicação.
      message: descreverSementeira(
        resultado.ramos.map((id) => ramoPorId(id)?.nome ?? id),
        resultado.categorias_criadas,
        resultado.produtos_criados,
        resultado.produtos_omitidos
      ),
      status: 200,
    }
  }

  /** Fecha o onboarding: a partir daqui a empresa entra directamente no painel. */
  async concluir({ params }: HttpContext) {
    const empresa = await this.service.concluir({ company_alias: params.company_alias })

    return {
      data: {
        concluido: empresa.onboardingConcluido,
        concluido_em: empresa.onboarding_concluido_em?.toISO() ?? null,
        ramo_actuacao: empresa.ramo_actuacao ?? null,
      },
      message: 'Configuração inicial concluída',
      status: 200,
    }
  }
}

/**
 * A frase que o ecrã mostra depois de escolher os ramos.
 *
 * Fora da acção porque tem vários casos e nenhum deles é interessante lá dentro. Todos
 * acontecem: "Serviços" e "Imóveis" só trazem categorias, "Começar do zero" não traz nada,
 * e voltar ao passo com os mesmos ramos já escolhidos não cria nada (a sementeira é
 * idempotente).
 */
function descreverSementeira(
  nomesDosRamos: string[],
  categorias: number,
  produtos: number,
  omitidos: number
): string {
  const ramos = listarNomes(nomesDosRamos)

  const partes: string[] = []
  if (categorias > 0) partes.push(`${categorias} categoria${categorias === 1 ? '' : 's'}`)
  if (produtos > 0) partes.push(`${produtos} produto${produtos === 1 ? '' : 's'} de exemplo`)

  // Semear menos do que o ramo tem e não o dizer deixaria o dono a pensar que o
  // catálogo do seu ramo é assim. O limite do plano é a única razão por que isto
  // acontece — ver `semearRamosDeActuacao`.
  const porLimite =
    omitidos > 0
      ? ` ${omitidos} produto${omitidos === 1 ? ' ficou' : 's ficaram'} de fora por o plano actual não ter espaço para mais — mude de plano para os receber.`
      : ''

  if (partes.length === 0) {
    return `${ramos} guardado${nomesDosRamos.length === 1 ? '' : 's'}. Não havia nada de novo a acrescentar ao catálogo.${porLimite}`
  }

  return `${ramos} guardado${nomesDosRamos.length === 1 ? '' : 's'}. Foram criados ${partes.join(
    ' e '
  )}. Defina o preço e o stock de cada produto antes de o vender.${porLimite}`
}

/** "Farmácia", "Farmácia e Perfumaria", "Farmácia, Perfumaria e Padaria". */
function listarNomes(nomes: string[]): string {
  const entreAspas = nomes.map((n) => `"${n}"`)
  if (entreAspas.length <= 1) return entreAspas[0] ?? ''
  return `${entreAspas.slice(0, -1).join(', ')} e ${entreAspas[entreAspas.length - 1]}`
}
