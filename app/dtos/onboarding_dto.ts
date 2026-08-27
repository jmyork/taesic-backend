import type { RamoDeActuacao } from '../helpers/ramos_de_actuacao.js'

export interface AplicarRamosDTO {
  company_alias: string
  /** O conjunto COMPLETO de ramos da empresa, não um acrescento: o que não vier na lista
   *  deixa de estar escolhido. Ver `onboarding_repository.aplicarRamos()`. */
  ramos: string[]
}

export interface ConcluirOnboardingDTO {
  company_alias: string
}

/** Um ramo tal como o frontend o desenha: sem o catálogo interno de produtos, que não lhe
 * serve para nada e é grande. Só o que o cartão de escolha mostra, mais a contagem do que
 * a escolha vai semear — é isso que torna a decisão informada em vez de uma surpresa. */
export interface RamoResumidoDTO {
  id: string
  nome: string
  descricao: string
  total_categorias: number
  total_produtos: number
  /** Os nomes das categorias, para o ecrã poder mostrar o que vem dentro do ramo sem
   *  pedir mais nada. São poucos e curtos; os produtos é que ficam de fora. */
  categorias: string[]
}

export interface EstadoOnboardingDTO {
  concluido: boolean
  concluido_em: string | null
  /** O ramo PRINCIPAL (o primeiro escolhido). `ramos_actuacao` é o conjunto. */
  ramo_actuacao: string | null
  /** Todos os ramos escolhidos. Fonte da verdade: a tabela `empresa_ramo`. */
  ramos_actuacao: string[]
  /** Postos de atendimento activos. Nunca 0 numa empresa registada depois desta mudança
   * — ver `app/helpers/posto_padrao.ts`. */
  postos_activos: number
  total_produtos: number
  total_categorias: number
  ramos: RamoResumidoDTO[]
}

export function resumirRamo(ramo: RamoDeActuacao): RamoResumidoDTO {
  return {
    id: ramo.id,
    nome: ramo.nome,
    descricao: ramo.descricao,
    total_categorias: ramo.categorias.length,
    total_produtos: ramo.produtos.length,
    categorias: [...ramo.categorias],
  }
}
