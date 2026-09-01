/**
 * `taxExemptionCode` — anexo 2.4 do Blueprint ("Tabela de Isenções de IVA").
 *
 * ⚠️ O texto da secção 1.1.2.6 chama-lhe "anexo 6.4"; o anexo existe mas está
 * numerado 2.4 neste PDF. As referências a "6.1/6.2/6.3/6.4", a "secção 4.1.5" e
 * a "secção 5.5.5" são todas a secções que não existem no documento entregue.
 * Ver `DIVERGENCIAS.md` #C-01.
 *
 * `mencao` é o texto que a lei obriga a IMPRIMIR na factura. Não vai na chamada
 * ao serviço — só o código vai — mas vive aqui porque é a mesma tabela, e ter as
 * duas colunas juntas evita que a factura em papel e o que foi comunicado à AGT
 * digam coisas diferentes.
 */
export interface IsencaoIva {
  readonly codigo: string
  readonly mencao: string
  readonly descricao: string | null
}

export const ISENCOES_IVA: readonly IsencaoIva[] = [
  {
    codigo: 'M10',
    mencao: 'Isento nos termos da alínea a) do nº1 do artigo 12.º do CIVA',
    descricao: 'A transmissão dos bens alimentares, conforme anexo I do presente código.',
  },
  {
    codigo: 'M11',
    mencao: 'Isento nos termos da alínea b) do nº1 do artigo 12.º do CIVA',
    descricao:
      'As transmissões de medicamentos destinados exclusivamente a fins terapêuticos e profilácticos.',
  },
  {
    codigo: 'M12',
    mencao: 'Isento nos termos da alínea c) do nº1 do artigo 12.º do CIVA',
    descricao:
      'As transmissões de cadeiras de rodas e veículos semelhantes, accionados manualmente ou por motor, para portadores de deficiência, aparelhos, máquinas de escrever com caracteres braille, impressoras para caracteres braille e os artefactos que se destinam a ser utilizados por invisuais ou a corrigir a audição.',
  },
  {
    codigo: 'M13',
    mencao: 'Isento nos termos da alínea d) do nº1 do artigo 12.º do CIVA',
    descricao: 'A transmissão de livros, incluindo em formato digital.',
  },
  {
    codigo: 'M14',
    mencao: 'Isento nos termos da alínea e) do nº1 do artigo 12.º do CIVA',
    descricao:
      'A locação de bens imóveis destinados a fins habitacionais, designadamente prédios urbanos, fracções autónomas destes ou terrenos para construção, com excepção das prestações de serviços de alojamento efectuadas no âmbito da actividade hoteleira ou de outras com funções análogas.',
  },
  {
    codigo: 'M15',
    mencao: 'Isento nos termos da alínea f) do nº1 do artigo 12.º do CIVA',
    descricao: 'As operações sujeitas ao imposto de SISA, ainda que dele isentas.',
  },
  {
    codigo: 'M16',
    mencao: 'Isento nos termos da alínea g) do nº1 do artigo 12.º do CIVA',
    descricao:
      'A exploração e a prática de jogos de fortuna ou azar e de diversão social, bem como as respectivas comissões e todas as operações relacionadas, quando as mesmas estejam sujeitas a Imposto Especial sobre o Jogos, nos termos da legislação aplicável.',
  },
  {
    codigo: 'M17',
    mencao: 'Isento nos termos da alínea h) do nº1 do artigo 12.º do CIVA',
    descricao: 'O transporte colectivo de passageiros.',
  },
  {
    codigo: 'M18',
    mencao: 'Isento nos termos da alínea i) do nº1 artigo 12.º do CIVA',
    descricao:
      'As operações de intermediação financeira, incluindo a locação financeira, exceptuando-se aquelas em que uma taxa, ou contraprestação, específica e predeterminada é cobrada pelo serviço.',
  },
  {
    codigo: 'M19',
    mencao: 'Isento nos termos da alínea j) do nº1 do artigo 12.º do CIVA',
    descricao: 'O seguro de saúde, bem como a prestação de seguros e resseguros do ramo vida.',
  },
  {
    codigo: 'M20',
    mencao: 'Isento nos termos da alínea k) do nº1 do artigo 12.º do CIVA',
    descricao: 'As transmissões de produtos petrolíferos conforme anexo II do presente código.',
  },
  {
    codigo: 'M21',
    mencao: 'Isento nos termos da alínea l) do nº1 do artigo 12.º do CIVA',
    descricao:
      'As prestações de serviço que tenham por objecto o ensino, efectuadas por estabelecimentos integrados conforme definidos na Lei de Bases do Sistema de Educação e Ensino, bem como por estabelecimentos de Ensino Superior devidamente reconhecidos pelo Ministério de Tutela.',
  },
  {
    codigo: 'M22',
    mencao: 'Isento nos termos da alínea m) do artigo 12.º do CIVA',
    descricao:
      'As prestações de serviço médico sanitário, efectuadas por estabelecimentos hospitalares, clínicas, dispensários e similares.',
  },
  {
    codigo: 'M23',
    mencao: 'Isento nos termos da alínea n) do artigo 12.º do CIVA',
    descricao:
      'O transporte de doentes ou feridos em ambulâncias ou outros veículos apropriados efectuados por organismos devidamente autorizados.',
  },
  {
    codigo: 'M24',
    mencao: 'Isento nos termos da alínea o) do artigo 12.º do CIVA',
    descricao:
      'Os equipamentos médicos para o exercício da actividade dos estabelecimentos de saúde.',
  },
  {
    codigo: 'M80',
    mencao: 'Isento nos termos da alínea a) do nº1 do artigo 14.º',
    descricao:
      'As importações definitivas de bens cuja transmissão no território nacional seja isenta de imposto.',
  },
  {
    codigo: 'M81',
    mencao: 'Isento nos termos da alínea b) do nº1 do artigo 14.º',
    descricao:
      'As importações de ouro, moedas ou notas de banco, efectuadas pelo Banco Nacional de Angola.',
  },
  {
    codigo: 'M82',
    mencao: 'Isento nos termos da alínea c) do nº1 do artigo 14.º',
    descricao:
      'A importação de bens destinados a ofertas para atenuar os efeitos das calamidades naturais, tais como cheias, tempestades, secas, ciclones, sismos, terramotos e outros de idêntica natureza, desde que devidamente autorizado pelo Titular do Poder Executivo.',
  },
  {
    codigo: 'M83',
    mencao: 'Isento nos termos da alínea d) do nº1 do artigo 14.º',
    descricao:
      'A importação de mercadorias ou equipamentos destinados exclusiva e directamente à execução das operações petrolíferas e mineiras nos termos da Lei que estabelece o Regime Aduaneiro do Sector Petrolífero e do Código Mineiro, respectivamente.',
  },
  {
    codigo: 'M84',
    mencao: 'Isento nos termos da alínea e) do nº1 do artigo 14.º',
    descricao:
      'Importação de moeda estrangeira efectuada pelas instituições financeiras bancárias, nos termos definidos pelo Banco Nacional de Angola.',
  },
  {
    codigo: 'M85',
    mencao: 'Isento nos termos da alínea a) do nº2 do artigo 14.º',
    descricao:
      'No âmbito de tratados e acordos internacionais de que a República de Angola seja parte, nos termos previstos nesses tratados e acordos.',
  },
  {
    codigo: 'M86',
    mencao: 'Isento nos termos da alínea b) do nº2 do artigo 14.º',
    descricao:
      'No âmbito de relações diplomáticas e consulares, quando a isenção resulte de tratados e acordos internacionais celebrados pela República de Angola.',
  },
  {
    codigo: 'M30',
    mencao: 'Isento nos termos da alínea a) do artigo 15.º do CIVA',
    descricao:
      'As transmissões de bens expedidos ou transportados com destino ao estrangeiro pelo vendedor ou por um terceiro por conta deste.',
  },
  {
    codigo: 'M31',
    mencao: 'Isento nos termos da alínea b) do artigo 15.º do CIVA',
    descricao:
      'As transmissões de bens de abastecimento postos a bordo das embarcações que efectuem navegação marítima em alto mar e que assegurem o transporte remunerado de passageiros ou o exercício de uma actividade comercial, industrial ou de pesca.',
  },
  {
    codigo: 'M32',
    mencao: 'Isento nos termos da alínea c) do artigo 15.º do CIVA',
    descricao:
      'As transmissões de bens de abastecimento postos a bordo das aeronaves utilizadas por companhias de navegação aérea que se dediquem principalmente ao tráfego internacional e que assegurem o transporte remunerado de passageiros, ou o exercício de uma actividade comercial ou industrial.',
  },
  {
    codigo: 'M33',
    mencao: 'Isento nos termos da alínea d) do artigo 15.º do CIVA',
    descricao:
      'As transmissões de bens de abastecimento postos a bordo das embarcações de salvamento, assistência marítima, pesca costeira e embarcações de guerra, quando deixem o país com destino a um porto ou ancoradouro situado no estrangeiro.',
  },
  {
    codigo: 'M34',
    mencao: 'Isento nos termos da alínea e) do artigo 15.º do CIVA',
    descricao:
      'As transmissões, transformações, reparações, manutenção, frete e aluguer, incluindo a locação financeira, de embarcações e aeronaves afectas às companhias de navegação aérea e marítima que se dediquem principalmente ao tráfego internacional, assim como as transmissões de bens de abastecimento postos a bordo das mesmas e as prestações de serviços efectuadas com vista à satisfação das suas necessidades directas e da respectiva carga.',
  },
  {
    codigo: 'M35',
    mencao: 'Isento nos termos da alínea f) do artigo 15.º do CIVA',
    descricao:
      'As transmissões de bens efectuadas no âmbito de relações diplomáticas e consulares cuja isenção resulte de acordos e convénios internacionais celebrados por Angola.',
  },
  {
    codigo: 'M36',
    mencao: 'Isento nos termos da alínea g) do artigo 15.º do CIVA',
    descricao:
      'As transmissões de bens destinados a organismos internacionais reconhecidos por Angola ou a membros dos mesmos organismos, nos limites e com as condições fixadas em acordos e convénios internacionais celebrados por Angola.',
  },
  {
    codigo: 'M37',
    mencao: 'Isento nos termos da alínea h) do artigo 15.º do CIVA',
    descricao:
      'As transmissões de bens efectuadas no âmbito de tratados e acordos internacionais de que a República de Angola seja parte, quando a isenção resulte desses mesmos tratados e acordos.',
  },
  {
    codigo: 'M38',
    mencao: 'Isento nos termos da alínea i) do artigo 15.º do CIVA',
    descricao: 'O transporte de pessoas provenientes ou com destino ao estrangeiro.',
  },
  {
    codigo: 'M90',
    mencao: 'Isento nos termos da alínea a) do nº1 do artigo 16.º',
    descricao:
      'As importações de bens que, sob controlo aduaneiro e de acordo com as disposições aduaneiras especificamente aplicáveis, sejam postas nos regimes de zona franca, que sejam introduzidos em armazéns de regimes aduaneiros ou lojas francas, enquanto permanecerem sob tais regimes.',
  },
  {
    codigo: 'M91',
    mencao: 'Isento nos termos da alínea b) do nº1 do artigo 16.º',
    descricao:
      'As transmissões de bens que sejam expedidos ou transportados para as zonas ou depósitos mencionados na alínea anterior, bem como as prestações de serviços directamente conexas com tais transmissões.',
  },
  {
    codigo: 'M92',
    mencao: 'Isento nos termos da alínea c) do nº1 do artigo 16.º',
    descricao:
      'As transmissões de bens que se efectuem nos regimes a que se refere a alínea a), assim como as prestações de serviços directamente conexas com tais transmissões, enquanto os bens permanecerem naquelas situações.',
  },
  {
    codigo: 'M93',
    mencao: 'Isento nos termos da alínea d) do nº1 do artigo 16.º',
    descricao:
      'As transmissões de bens que se encontrem nos regimes de trânsito, draubaque ou importação temporária e as prestações de serviços directamente conexas com tais operações, enquanto os mesmos forem considerados abrangidos por aqueles regimes.',
  },
  { codigo: 'M00', mencao: 'IVA – Regime Simplificado', descricao: null },
  { codigo: 'M02', mencao: 'Transmissão de bens e serviço não sujeita', descricao: null },
  { codigo: 'M04', mencao: 'IVA – Regime de Exclusão', descricao: null },
]

const PORCODIGO = new Map<string, IsencaoIva>(ISENCOES_IVA.map((i) => [i.codigo, i]))

export function isencaoIvaValida(codigo: string): boolean {
  return PORCODIGO.has(codigo)
}

export function isencaoIva(codigo: string): IsencaoIva | undefined {
  return PORCODIGO.get(codigo)
}

/**
 * A menção legal a imprimir no documento. Devolve `null` para um código
 * desconhecido em vez de lançar: quem imprime uma factura não deve ficar sem
 * factura porque a tabela de isenções ficou desactualizada.
 */
export function mencaoDeIsencao(codigo: string): string | null {
  return PORCODIGO.get(codigo)?.mencao ?? null
}
