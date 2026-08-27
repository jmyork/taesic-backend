import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import produto_categorias from '#models/faturacao/produto_categorias'
import produtos from '#models/faturacao/produtos'
import categorias_produtos from '#models/faturacao/categorias_produtos'
import { proximoNumeroPorEmpresa } from './sequencial_numero.js'

/**
 * O catálogo de ramos de actuação do onboarding — e o que cada um semeia.
 *
 * ── Vários ramos, não um ─────────────────────────────────────────────────────
 *
 * Uma empresa escolhe QUANTOS quiser: uma farmácia que também vende perfumaria, um
 * supermercado com padaria. O que é semeado é a união dos catálogos escolhidos, sem
 * repetições — ver `semearRamosDeActuacao`.
 *
 * ── O que é semeado, e o que NÃO é ─────────────────────────────────────────────
 *
 * Categorias de produto, e produtos de exemplo ligados a elas. **Sem lote**, portanto sem
 * preço e sem stock. Um produto sem lote aparece na lista de produtos do dashboard
 * (`incluir_sem_lote`) e NÃO aparece no PDV — ver `catalogo_produtos_query.ts`. É essa a
 * intenção: o dono encontra o catálogo já com forma, edita cada linha com o preço e o
 * stock reais, e só então o produto fica vendável.
 *
 * A alternativa — semear com lote a preço 0 — poria produtos a 0 Kz prontos a passar pela
 * caixa. Um produto por preencher deve ser invisível ao PDV, não vendável de graça.
 *
 * ── Porque é que "Serviços" e "Imóveis" não semeiam produtos ───────────────────
 *
 * Neste sistema um serviço (`is_service`) não existe sem lote: `produtos_repository.
 * create()` cria-lhe sempre um, com `quantidade_em_estoque = 0`, porque é o lote que lhe
 * guarda o preço — um serviço não tem stock, logo a única coisa que o torna vendável é o
 * preço que lá está. Semear serviços obrigaria a inventar esse preço, que é precisamente
 * o que a regra acima recusa.
 *
 * Semeá-los como produto físico (`is_service: false`) seria pior: entravam no controlo de
 * stock e nos alertas de validade, e uma consultoria não tem nem uma coisa nem outra.
 *
 * Estes dois ramos recebem por isso só as categorias. É menos, e é verdade — a alternativa
 * era encher o catálogo com linhas que o dono teria de apagar à mão.
 *
 * ── Acrescentar um ramo ────────────────────────────────────────────────────────
 *
 * Só aqui. `empresa_ramo.ramo` é texto e não chave estrangeira de propósito, o frontend lê
 * esta lista por `GET api/:company_alias/onboarding/ramos` em vez de a repetir, e não há
 * migração nenhuma envolvida. Um `id` NUNCA deve ser renomeado depois de estar em
 * produção: fica gravado nas empresas que o escolheram, e passaria a apontar para nada.
 */

export interface ProdutoDeRamo {
  nome: string
  descricao: string
  /** Tem de constar em `categorias` do mesmo ramo — a sementeira liga os dois. */
  categoria: string
}

export interface RamoDeActuacao {
  id: string
  nome: string
  descricao: string
  categorias: readonly string[]
  produtos: readonly ProdutoDeRamo[]
}

/**
 * "Começar com o catálogo vazio": escolha válida, que não semeia nada.
 *
 * É gravada como qualquer outra — não é ausência de escolha. A diferença entre "ainda não
 * escolheu" (nenhuma linha em `empresa_ramo`) e "escolheu não usar modelo nenhum" é real,
 * e perde-se se o segundo caso também for vazio.
 *
 * É **exclusiva**: escolhê-la limpa as outras, e escolher outra limpa-a a ela. Ver
 * `onboarding_repository.aplicarRamos()`.
 */
export const RAMO_PERSONALIZADO = 'personalizado'

/** Atalho para descrever um produto sem repetir a categoria em cada linha. */
function emCategoria(
  categoria: string,
  itens: readonly (readonly [nome: string, descricao: string])[]
): ProdutoDeRamo[] {
  return itens.map(([nome, descricao]) => ({ nome, descricao, categoria }))
}

export const RAMOS_DE_ACTUACAO: readonly RamoDeActuacao[] = [
  {
    id: 'farmacia',
    nome: 'Farmácia',
    descricao: 'Medicamentos, higiene e saúde',
    categorias: [
      'Medicamentos',
      'Material de Penso',
      'Higiene e Beleza',
      'Puericultura',
      'Suplementos',
    ],
    produtos: [
      ...emCategoria('Medicamentos', [
        ['Paracetamol 500 mg', 'Analgésico e antipirético, caixa de 20'],
        ['Ibuprofeno 400 mg', 'Anti-inflamatório, caixa de 20'],
        ['Amoxicilina 500 mg', 'Antibiótico, caixa de 16'],
        ['Sal de rehidratação oral', 'Saqueta para diarreia e desidratação'],
        ['Xarope para a tosse', 'Frasco de 100 ml'],
        ['Pomada anti-fúngica', 'Bisnaga de 30 g'],
      ]),
      ...emCategoria('Material de Penso', [
        ['Soro fisiológico 500 ml', 'Lavagem e hidratação'],
        ['Álcool etílico 70%', 'Desinfectante de uso externo'],
        ['Ligadura elástica', 'Rolo de 10 cm'],
        ['Pensos rápidos', 'Caixa de 20 unidades'],
        ['Luvas descartáveis', 'Caixa de 100 unidades'],
      ]),
      ...emCategoria('Higiene e Beleza', [
        ['Gel de banho', 'Frasco de 500 ml'],
        ['Pasta de dentes', 'Bisnaga de 100 ml'],
        ['Protector solar FPS 50', 'Frasco de 200 ml'],
      ]),
      ...emCategoria('Puericultura', [
        ['Fraldas descartáveis', 'Pacote, tamanho a definir'],
        ['Toalhitas de bebé', 'Pacote de 72 unidades'],
        ['Biberão 250 ml', 'Com tetina de silicone'],
      ]),
      ...emCategoria('Suplementos', [
        ['Multivitamínico', 'Frasco de 60 comprimidos'],
        ['Vitamina C 1000 mg', 'Tubo de 20 comprimidos efervescentes'],
        ['Sulfato ferroso', 'Suplemento de ferro'],
      ]),
    ],
  },
  {
    id: 'supermercado',
    nome: 'Supermercado',
    descricao: 'Mercearia, bebidas e produtos de casa',
    categorias: ['Mercearia', 'Bebidas', 'Frescos', 'Congelados', 'Limpeza', 'Higiene Pessoal'],
    produtos: [
      ...emCategoria('Mercearia', [
        ['Arroz 1 kg', 'Arroz branco, pacote de 1 kg'],
        ['Fuba de milho 1 kg', 'Farinha de milho'],
        ['Feijão 1 kg', 'Feijão seco'],
        ['Óleo alimentar 1 L', 'Óleo vegetal'],
        ['Açúcar 1 kg', 'Açúcar branco'],
        ['Sal 1 kg', 'Sal refinado'],
        ['Massa esparguete 500 g', 'Massa seca'],
        ['Atum em lata', 'Lata de 120 g'],
      ]),
      ...emCategoria('Bebidas', [
        ['Água mineral 1,5 L', 'Água sem gás'],
        ['Refrigerante 33 cl', 'Lata'],
        ['Sumo de fruta 1 L', 'Néctar'],
        ['Cerveja 33 cl', 'Garrafa'],
      ]),
      ...emCategoria('Frescos', [
        ['Ovos (dúzia)', 'Ovos frescos'],
        ['Leite 1 L', 'Leite UHT meio-gordo'],
        ['Pão de forma', 'Embalagem'],
      ]),
      ...emCategoria('Congelados', [
        ['Frango congelado', 'Peça inteira'],
        ['Carapau congelado', 'Caixa'],
      ]),
      ...emCategoria('Limpeza', [
        ['Detergente da loiça', 'Frasco de 500 ml'],
        ['Lixívia 1 L', 'Desinfectante'],
        ['Sabão em pó 1 kg', 'Detergente para roupa'],
      ]),
      ...emCategoria('Higiene Pessoal', [
        ['Papel higiénico (pack 4)', 'Embalagem de 4 rolos'],
        ['Sabonete', 'Barra de 90 g'],
        ['Escova de dentes', 'Unidade'],
      ]),
    ],
  },
  {
    id: 'restauracao',
    nome: 'Restaurante',
    descricao: 'Comidas e bebidas servidas à mesa',
    categorias: ['Entradas', 'Pratos Principais', 'Acompanhamentos', 'Sobremesas', 'Bebidas'],
    produtos: [
      ...emCategoria('Entradas', [
        ['Salada mista', 'Entrada fria'],
        ['Sopa de legumes', 'Sopa do dia'],
        ['Rissóis de camarão', 'Dose de 4 unidades'],
      ]),
      ...emCategoria('Pratos Principais', [
        ['Calulu de peixe', 'Prato tradicional'],
        ['Muamba de galinha', 'Prato tradicional'],
        ['Feijoada de óleo de palma', 'Prato tradicional'],
        ['Arroz de marisco', 'Para uma pessoa'],
        ['Bife grelhado', 'Com molho à escolha'],
        ['Frango assado', 'Meio frango'],
      ]),
      ...emCategoria('Acompanhamentos', [
        ['Funge de bombó', 'Dose'],
        ['Batata frita', 'Dose'],
        ['Arroz branco', 'Dose'],
      ]),
      ...emCategoria('Sobremesas', [
        ['Doce de ginguba', 'Sobremesa da casa'],
        ['Salada de fruta', 'Fruta da época'],
        ['Pudim', 'Fatia'],
      ]),
      ...emCategoria('Bebidas', [
        ['Água 0,5 L', 'Água sem gás'],
        ['Refrigerante 33 cl', 'Lata'],
        ['Cerveja 33 cl', 'Garrafa'],
        ['Café', 'Chávena'],
      ]),
    ],
  },
  {
    id: 'padaria',
    nome: 'Padaria e Pastelaria',
    descricao: 'Pão, bolos e salgados',
    categorias: ['Pão', 'Pastelaria', 'Bolos', 'Salgados', 'Bebidas'],
    produtos: [
      ...emCategoria('Pão', [
        ['Pão de trigo', 'Unidade'],
        ['Cacete', 'Unidade'],
        ['Pão de leite', 'Unidade'],
        ['Pão integral', 'Unidade'],
      ]),
      ...emCategoria('Pastelaria', [
        ['Croissant', 'Unidade'],
        ['Pastel de nata', 'Unidade'],
        ['Bolo de arroz', 'Unidade'],
      ]),
      ...emCategoria('Bolos', [
        ['Bolo de chocolate (fatia)', 'Fatia'],
        ['Bolo de aniversário', 'Por encomenda'],
        ['Torta de laranja', 'Fatia'],
      ]),
      ...emCategoria('Salgados', [
        ['Empada de frango', 'Unidade'],
        ['Coxinha', 'Unidade'],
        ['Sandes mista', 'Unidade'],
      ]),
      ...emCategoria('Bebidas', [
        ['Café', 'Chávena'],
        ['Sumo natural', 'Copo'],
      ]),
    ],
  },
  {
    id: 'vestuario',
    nome: 'Loja de Roupa',
    descricao: 'Vestuário, calçado e acessórios',
    categorias: ['Senhora', 'Homem', 'Criança', 'Calçado', 'Acessórios'],
    produtos: [
      ...emCategoria('Senhora', [
        ['Blusa', 'Manga curta'],
        ['Vestido', 'Vestido de dia'],
        ['Saia', 'Comprimento médio'],
        ['Calças de ganga', 'Corte clássico'],
      ]),
      ...emCategoria('Homem', [
        ['T-shirt', 'Manga curta, algodão'],
        ['Camisa', 'Manga comprida'],
        ['Calças de sarja', 'Corte direito'],
        ['Casaco', 'Casaco leve'],
      ]),
      ...emCategoria('Criança', [
        ['Conjunto de criança', 'Camisola e calças'],
        ['Fato de treino infantil', 'Dois anos a dez anos'],
      ]),
      ...emCategoria('Calçado', [
        ['Ténis', 'Calçado desportivo'],
        ['Sapato clássico', 'Pele sintética'],
        ['Sandálias', 'Verão'],
      ]),
      ...emCategoria('Acessórios', [
        ['Cinto de pele', 'Acessório'],
        ['Boné', 'Unidade'],
        ['Mala de mão', 'Unidade'],
      ]),
    ],
  },
  {
    id: 'cosmetica',
    nome: 'Perfumaria e Cosmética',
    descricao: 'Beleza, cabelo e cuidados de pele',
    categorias: ['Perfumes', 'Cabelo', 'Cuidados de Pele', 'Maquilhagem', 'Unhas'],
    produtos: [
      ...emCategoria('Perfumes', [
        ['Perfume 50 ml', 'Eau de parfum'],
        ['Desodorizante spray', 'Frasco de 150 ml'],
        ['Body splash', 'Frasco de 200 ml'],
      ]),
      ...emCategoria('Cabelo', [
        ['Champô 400 ml', 'Todos os tipos de cabelo'],
        ['Amaciador 400 ml', 'Hidratação'],
        ['Óleo capilar', 'Frasco de 100 ml'],
        ['Extensões de cabelo', 'Pacote'],
      ]),
      ...emCategoria('Cuidados de Pele', [
        ['Creme hidratante', 'Boião de 200 ml'],
        ['Manteiga de karité', 'Boião de 250 g'],
        ['Protector solar FPS 50', 'Frasco de 200 ml'],
      ]),
      ...emCategoria('Maquilhagem', [
        ['Base líquida', 'Frasco de 30 ml'],
        ['Batom', 'Unidade'],
        ['Rímel', 'Unidade'],
        ['Pó compacto', 'Unidade'],
      ]),
      ...emCategoria('Unhas', [
        ['Verniz de unhas', 'Frasco de 15 ml'],
        ['Acetona 100 ml', 'Removedor de verniz'],
      ]),
    ],
  },
  {
    id: 'papelaria',
    nome: 'Papelaria',
    descricao: 'Material escolar e de escritório',
    categorias: ['Material Escolar', 'Escritório', 'Informática', 'Impressão'],
    produtos: [
      ...emCategoria('Material Escolar', [
        ['Caderno A4 pautado', '100 folhas'],
        ['Esferográfica azul', 'Unidade'],
        ['Lápis de carvão', 'Unidade'],
        ['Caixa de lápis de cor', '12 cores'],
        ['Mochila escolar', 'Unidade'],
        ['Régua de 30 cm', 'Plástico'],
      ]),
      ...emCategoria('Escritório', [
        ['Resma de papel A4', '500 folhas'],
        ['Agrafador', 'Unidade'],
        ['Dossiê de arquivo', 'Lombada larga'],
        ['Marcador permanente', 'Unidade'],
        ['Post-it', 'Bloco'],
      ]),
      ...emCategoria('Informática', [
        ['Pen drive 32 GB', 'USB'],
        ['Rato óptico', 'Com fio'],
        ['Cabo HDMI', '1,5 metros'],
      ]),
      ...emCategoria('Impressão', [
        ['Toner preto', 'Compatível'],
        ['Tinteiro a cores', 'Compatível'],
        ['Plastificação A4', 'Bolsa'],
      ]),
    ],
  },
  {
    id: 'ferragens',
    nome: 'Ferragens e Construção',
    descricao: 'Ferramentas e materiais de obra',
    categorias: ['Ferramentas', 'Material Eléctrico', 'Canalização', 'Construção', 'Pintura'],
    produtos: [
      ...emCategoria('Ferramentas', [
        ['Martelo', 'Cabo de madeira'],
        ['Chave de fendas (jogo)', 'Jogo de 6'],
        ['Alicate universal', 'Unidade'],
        ['Fita métrica 5 m', 'Unidade'],
        ['Berbequim', 'Eléctrico'],
      ]),
      ...emCategoria('Material Eléctrico', [
        ['Cabo eléctrico 2,5 mm', 'Rolo de 100 m'],
        ['Interruptor simples', 'Unidade'],
        ['Tomada', 'Unidade'],
        ['Lâmpada LED', 'Unidade'],
      ]),
      ...emCategoria('Canalização', [
        ['Tubo PVC 50 mm', 'Barra de 3 m'],
        ['Torneira de lavatório', 'Unidade'],
        ['Fita de teflon', 'Rolo'],
      ]),
      ...emCategoria('Construção', [
        ['Saco de cimento 50 kg', 'Unidade'],
        ['Bloco de cimento', 'Unidade'],
        ['Vergalhão de ferro', 'Barra'],
      ]),
      ...emCategoria('Pintura', [
        ['Tinta plástica 15 L', 'Balde'],
        ['Trincha', 'Unidade'],
        ['Rolo de pintura', 'Unidade'],
      ]),
    ],
  },
  {
    id: 'electronica',
    nome: 'Electrónica e Informática',
    descricao: 'Telemóveis, computadores e acessórios',
    categorias: ['Telemóveis', 'Computadores', 'Acessórios', 'Áudio e Imagem', 'Energia'],
    produtos: [
      ...emCategoria('Telemóveis', [
        ['Telemóvel', 'Modelo a definir'],
        ['Capa de telemóvel', 'Unidade'],
        ['Película de vidro', 'Unidade'],
      ]),
      ...emCategoria('Computadores', [
        ['Computador portátil', 'Modelo a definir'],
        ['Teclado', 'Com fio'],
        ['Monitor', 'Modelo a definir'],
      ]),
      ...emCategoria('Acessórios', [
        ['Carregador USB-C', 'Unidade'],
        ['Cabo USB', 'Unidade'],
        ['Auscultadores', 'Unidade'],
        ['Cartão de memória 64 GB', 'MicroSD'],
      ]),
      ...emCategoria('Áudio e Imagem', [
        ['Coluna Bluetooth', 'Unidade'],
        ['Televisor', 'Modelo a definir'],
      ]),
      ...emCategoria('Energia', [
        ['Powerbank 10000 mAh', 'Unidade'],
        ['Estabilizador de tensão', 'Unidade'],
        ['Extensão eléctrica', '5 tomadas'],
      ]),
    ],
  },
  {
    id: 'agropecuaria',
    nome: 'Agropecuária',
    descricao: 'Sementes, rações e produtos agrícolas',
    categorias: ['Sementes', 'Adubos', 'Rações', 'Veterinária', 'Utensílios'],
    produtos: [
      ...emCategoria('Sementes', [
        ['Semente de milho', 'Saco'],
        ['Semente de feijão', 'Saco'],
        ['Semente de hortaliça', 'Pacote'],
      ]),
      ...emCategoria('Adubos', [
        ['Adubo NPK', 'Saco de 50 kg'],
        ['Ureia', 'Saco de 50 kg'],
        ['Composto orgânico', 'Saco'],
      ]),
      ...emCategoria('Rações', [
        ['Ração para aves', 'Saco de 25 kg'],
        ['Ração para suínos', 'Saco de 25 kg'],
        ['Farelo de milho', 'Saco'],
      ]),
      ...emCategoria('Veterinária', [
        ['Vacina avícola', 'Frasco'],
        ['Desparasitante', 'Frasco'],
      ]),
      ...emCategoria('Utensílios', [
        ['Enxada', 'Unidade'],
        ['Catana', 'Unidade'],
        ['Pulverizador 16 L', 'Unidade'],
        ['Regador', 'Unidade'],
      ]),
    ],
  },
  {
    // Só categorias — ver o cabeçalho deste ficheiro para o porquê.
    id: 'servicos',
    nome: 'Serviços',
    descricao: 'Consultoria, manutenção e assistência',
    categorias: ['Consultoria', 'Manutenção', 'Formação', 'Assistência Técnica'],
    produtos: [],
  },
  {
    // Só categorias — ver o cabeçalho deste ficheiro para o porquê.
    id: 'imobiliaria',
    nome: 'Imóveis',
    descricao: 'Arrendamento, venda e gestão',
    categorias: ['Arrendamento', 'Venda', 'Gestão de Condomínio', 'Avaliação'],
    produtos: [],
  },
  {
    id: RAMO_PERSONALIZADO,
    nome: 'Começar do zero',
    descricao: 'Sem catálogo de arranque',
    categorias: [],
    produtos: [],
  },
]

export function ramoPorId(id: string): RamoDeActuacao | undefined {
  return RAMOS_DE_ACTUACAO.find((r) => r.id === id)
}

export interface ResultadoDaSementeira {
  categorias_criadas: number
  produtos_criados: number
}

/**
 * Cria as categorias e os produtos de exemplo dos ramos escolhidos.
 *
 * **A união dos catálogos, semeada de uma vez.** Uma farmácia que também faz perfumaria
 * escolhe os dois ramos e recebe as categorias e produtos de ambos, sem repetições — e sem
 * N passagens à base de dados, que é o que aconteceria a chamar isto uma vez por ramo.
 *
 * **Idempotente por nome.** Nada é duplicado se já existir uma categoria ou um produto com
 * o mesmo nome nesta empresa. A comparação é sobre o nome em minúsculas e sem espaços à
 * volta, como em `semearMetodosPagamento`. Não é defesa contra duplo clique: o passo do
 * onboarding pode ser revisitado (o carrossel anda para trás), e cada passagem voltaria a
 * chamar isto.
 *
 * Dois ramos que partilhem o nome de um produto (`Protector solar FPS 50` está em Farmácia
 * e em Perfumaria) criam-no UMA vez, na categoria do primeiro ramo da lista. É o
 * comportamento certo: `produtos` não tem unicidade por nome, portanto a alternativa era
 * duas linhas iguais no catálogo do dono.
 *
 * `trx` é obrigatório: `produtos.numero` é um sequencial por empresa e
 * `proximoNumeroPorEmpresa` bloqueia a linha da empresa para o calcular — sem transacção
 * não há lock nenhum, e dois pedidos em paralelo escolhiam o mesmo número (a tabela tem
 * `unique(empresa_id, numero)`).
 */
export async function semearRamosDeActuacao(
  empresaId: string,
  ramoIds: readonly string[],
  trx: TransactionClientContract
): Promise<ResultadoDaSementeira> {
  const ramos = ramoIds.map((id) => {
    const ramo = ramoPorId(id)
    if (!ramo) throw new Error(`Ramo de actuação desconhecido: ${id}`)
    return ramo
  })

  const nadaFeito = { categorias_criadas: 0, produtos_criados: 0 }

  // União, preservando a ordem de escolha e sem repetir.
  const categoriasDesejadas: string[] = []
  const vistasCategorias = new Set<string>()
  for (const ramo of ramos) {
    for (const nome of ramo.categorias) {
      const chave = nome.trim().toLowerCase()
      if (vistasCategorias.has(chave)) continue
      vistasCategorias.add(chave)
      categoriasDesejadas.push(nome)
    }
  }

  const produtosDesejados: ProdutoDeRamo[] = []
  const vistosProdutos = new Set<string>()
  for (const ramo of ramos) {
    for (const produto of ramo.produtos) {
      const chave = produto.nome.trim().toLowerCase()
      if (vistosProdutos.has(chave)) continue
      vistosProdutos.add(chave)
      produtosDesejados.push(produto)
    }
  }

  if (categoriasDesejadas.length === 0 && produtosDesejados.length === 0) return nadaFeito

  // ── Categorias ────────────────────────────────────────────────────────────────
  const categoriasExistentes = await produto_categorias
    .query({ client: trx })
    .where('empresa_id', empresaId)
    .select('id', 'nome')

  // Do nome normalizado para o id, para os produtos poderem ligar-se tanto às categorias
  // que já cá estavam como às acabadas de criar.
  const idPorCategoria = new Map<string, string>(
    categoriasExistentes.map((c) => [c.nome.trim().toLowerCase(), c.id])
  )

  const categoriasEmFalta = categoriasDesejadas.filter(
    (nome) => !idPorCategoria.has(nome.trim().toLowerCase())
  )

  if (categoriasEmFalta.length > 0) {
    const criadas = await produto_categorias.createMany(
      categoriasEmFalta.map((nome) => ({
        nome,
        descricao: `Categoria criada na configuração inicial`,
        empresa_id: empresaId,
      })),
      { client: trx }
    )
    criadas.forEach((c) => idPorCategoria.set(c.nome.trim().toLowerCase(), c.id))
  }

  // ── Produtos ──────────────────────────────────────────────────────────────────
  const produtosExistentes = await produtos
    .query({ client: trx })
    .where('empresa_id', empresaId)
    .select('nome')

  const nomesOcupados = new Set(produtosExistentes.map((p) => p.nome.trim().toLowerCase()))
  const produtosEmFalta = produtosDesejados.filter(
    (p) => !nomesOcupados.has(p.nome.trim().toLowerCase())
  )

  if (produtosEmFalta.length === 0) {
    return { categorias_criadas: categoriasEmFalta.length, produtos_criados: 0 }
  }

  // Uma só chamada, e depois incrementa-se: `proximoNumeroPorEmpresa` bloqueia a linha da
  // empresa e esse lock dura até ao fim da transacção — chamá-la N vezes daria o mesmo
  // resultado e N idas à base de dados a mais.
  const primeiroNumero = await proximoNumeroPorEmpresa(trx, empresaId, produtos)

  const criados = await produtos.createMany(
    produtosEmFalta.map((p, i) => ({
      nome: p.nome,
      descricao: p.descricao,
      // Físico e disponível, sem lote: o dono define preço e stock antes de vender.
      is_service: false,
      disponivel: true,
      empresa_id: empresaId,
      numero: primeiroNumero + i,
    })),
    { client: trx }
  )

  const ligacoes = criados
    .map((produto, i) => ({
      produto_id: produto.id,
      produto_categoria_id: idPorCategoria.get(produtosEmFalta[i].categoria.trim().toLowerCase()),
    }))
    // Uma categoria em falta no catálogo do próprio ramo é erro de dados deste ficheiro,
    // não do utilizador: o produto fica sem categoria em vez de rebentar o passo todo.
    .filter(
      (l): l is { produto_id: string; produto_categoria_id: string } => !!l.produto_categoria_id
    )

  if (ligacoes.length > 0) {
    await categorias_produtos.createMany(ligacoes, { client: trx })
  }

  return { categorias_criadas: categoriasEmFalta.length, produtos_criados: criados.length }
}
