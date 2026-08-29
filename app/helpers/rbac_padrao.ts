import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import Permissao from '#models/auth/permissao'
import PapelPermissao from '#models/auth/papel_permissao'

/**
 * O catálogo RBAC por omissão: que papéis existem, que permissões existem, e
 * quais delas cada papel tem.
 *
 * Estava dentro de `database_seeder.ts`, e isso tinha um custo concreto: o
 * seeder NÃO é idempotente (`Users.createMany` rebenta com emails repetidos),
 * por isso não havia como levar uma permissão nova a uma base que já tem dados.
 * O caminho era `node ace permissao:conceder`, um comando de cada vez. Aqui os
 * dados ficam separados do acto de os inserir, e `semearRbacPadrao()` pode
 * correr as vezes que forem precisas.
 *
 * Os papéis de inquilino nascem como `modelo`: ninguém os usa directamente. Cada
 * empresa recebe a SUA cópia no registo (ver `clonarPapeisPadrao()` em
 * papeis_da_empresa.ts), e é a cópia que é atribuída. É isso que permite a uma
 * empresa mudar o seu "Vendedor" sem mudar o de todas as outras — e é também a
 * razão de afinar um modelo aqui só afectar empresas criadas a partir de então.
 * Para as que já existem: `node ace permissao:conceder <perm> <papel> --todas-empresas`.
 *
 * Extraído mecanicamente do seeder (scripts/schema/extrair_rbac.cjs) para que
 * nenhum dos 316 nomes de permissão dependesse de uma cópia à mão.
 */

export interface PapelPadrao {
  nome: string
  descricao: string
  escopo: (typeof ESCOPO_PAPEL)[keyof typeof ESCOPO_PAPEL]
}

export interface PermissaoPadrao {
  nome: string
  descricao: string
}

export const PAPEIS_PADRAO: PapelPadrao[] = [
  {
    nome: 'Admin',
    descricao: 'Administrador do domínio/empresa',
    escopo: 'modelo',
  },
  {
    nome: 'Estoquista',
    descricao: 'Responsável por gerenciar o estoque do domínio',
    escopo: 'modelo',
  },
  {
    nome: 'EstoquistaVisualizador',
    descricao: 'Visualizador de estoque do domínio',
    escopo: 'modelo',
  },
  {
    nome: 'Vendedor',
    descricao: 'Responsável por gerenciar as vendas do domínio',
    escopo: 'modelo',
  },
  {
    nome: 'VendedorVisualizador',
    descricao: 'Visualizador de vendas do domínio',
    escopo: 'modelo',
  },
  {
    nome: 'AdminVisualizador',
    descricao: 'Visualizador geral do domínio (read-only)',
    escopo: 'modelo',
  },
  {
    nome: 'AdminUserManager',
    descricao: 'Gerenciador de usuários do domínio',
    escopo: 'modelo',
  },
  {
    nome: 'AdminUserVisualizador',
    descricao: 'Visualizador de usuários do domínio',
    escopo: 'modelo',
  },
  {
    nome: 'Gerente',
    descricao: 'Gerente do domínio/empresa',
    escopo: 'modelo',
  },
  {
    nome: 'Supervisor',
    descricao: 'Supervisor do domínio/empresa',
    escopo: 'modelo',
  },
  // ===== PLATAFORMA (Global) =====
  {
    nome: 'Platform_Admin',
    descricao: 'Administrador da plataforma (acesso total)',
    escopo: 'plataforma',
  },
  {
    nome: 'Platform_Manager',
    descricao: 'Gerente da plataforma (gestão de empresas/usuários)',
    escopo: 'plataforma',
  },
  {
    nome: 'Platform_User',
    descricao: 'Usuário normal da plataforma (consulta apenas)',
    escopo: 'plataforma',
  },
  {
    nome: 'Platform_Manager_Visualizer',
    descricao: 'Gerente de plataforma com acesso read-only',
    escopo: 'plataforma',
  },
  {
    nome: 'Platform_Admin_Visualizer',
    descricao: 'Administrador de plataforma com acesso read-only',
    escopo: 'plataforma',
  },
]

export const PERMISSOES_PADRAO: PermissaoPadrao[] = [
  // ==================== PRODUTO-MARCAS ====================
  { nome: 'domain_produto_marcas.index', descricao: 'Listar marcas de produto' },
  { nome: 'domain_produto_marcas.show', descricao: 'Ver marca de produto específica' },
  { nome: 'domain_produto_marcas.store', descricao: 'Criar marca de produto' },
  { nome: 'domain_produto_marcas.update', descricao: 'Editar marca de produto' },
  { nome: 'domain_produto_marcas.destroy', descricao: 'Remover/Recuperar marca de produto' },

  // ==================== PRODUTO-FORMATOS ====================
  { nome: 'domain_produto_formatos.index', descricao: 'Listar formatos de produto' },
  { nome: 'domain_produto_formatos.show', descricao: 'Ver formato de produto específico' },
  { nome: 'domain_produto_formatos.store', descricao: 'Criar formato de produto' },
  { nome: 'domain_produto_formatos.update', descricao: 'Editar formato de produto' },
  {
    nome: 'domain_produto_formatos.destroy',
    descricao: 'Remover/Recuperar formato de produto',
  },

  // ==================== PRODUTO-CATEGORIAS ====================
  { nome: 'domain_produto_categorias.index', descricao: 'Listar categorias de produto' },
  { nome: 'domain_produto_categorias.show', descricao: 'Ver categoria de produto específica' },
  { nome: 'domain_produto_categorias.store', descricao: 'Criar categoria de produto' },
  { nome: 'domain_produto_categorias.update', descricao: 'Editar categoria de produto' },
  {
    nome: 'domain_produto_categorias.destroy',
    descricao: 'Remover/Recuperar categoria de produto',
  },

  // ==================== PRODUTO-FABRICANTES ====================
  { nome: 'domain_produto_fabricantes.index', descricao: 'Listar fabricantes' },
  { nome: 'domain_produto_fabricantes.show', descricao: 'Ver fabricante específico' },
  { nome: 'domain_produto_fabricantes.store', descricao: 'Criar fabricante' },
  { nome: 'domain_produto_fabricantes.update', descricao: 'Editar fabricante' },
  { nome: 'domain_produto_fabricantes.destroy', descricao: 'Remover/Recuperar fabricante' },

  // ==================== PRODUTO-FORNECEDORES ====================
  { nome: 'domain_produto_fornecedores.index', descricao: 'Listar fornecedores' },
  { nome: 'domain_produto_fornecedores.show', descricao: 'Ver fornecedor específico' },
  { nome: 'domain_produto_fornecedores.store', descricao: 'Criar fornecedor' },
  { nome: 'domain_produto_fornecedores.update', descricao: 'Editar fornecedor' },
  { nome: 'domain_produto_fornecedores.destroy', descricao: 'Remover/Recuperar fornecedor' },

  // ==================== PRODUTOS ====================
  { nome: 'domain_produtos.index', descricao: 'Listar produtos do domínio' },
  { nome: 'domain_produtos.show', descricao: 'Ver produto específico' },
  { nome: 'domain_produtos.store', descricao: 'Criar produto' },
  { nome: 'domain_produtos.update', descricao: 'Editar produto' },
  { nome: 'domain_produtos.destroy', descricao: 'Remover/Recuperar produto' },
  {
    nome: 'domain_produtos.catalogo',
    descricao:
      'Catálogo de produtos em stock, pesquisável e filtrável, com todas as características',
  },
  {
    nome: 'domain_produtos.registrar_com_detalhes',
    descricao:
      'Registar produto com detalhes (descrições, categorias, contraindicações, recomendações)',
  },
  {
    nome: 'domain_produtos.alertas',
    descricao: 'Alertas de produtos (stock baixo/esgotado, validade próxima/expirada)',
  },

  // ==================== PRODUTO-DESCRICOES ====================
  { nome: 'domain_produto_descricoes.index', descricao: 'Listar descrições de produto' },
  { nome: 'domain_produto_descricoes.show', descricao: 'Ver descrição de produto específica' },
  { nome: 'domain_produto_descricoes.store', descricao: 'Criar descrição de produto' },
  { nome: 'domain_produto_descricoes.update', descricao: 'Editar descrição de produto' },
  {
    nome: 'domain_produto_descricoes.destroy',
    descricao: 'Remover/Recuperar descrição de produto',
  },

  // ==================== PRODUTO-IMAGENS ====================
  // NOTA: .except(['index', 'update']) - sem index e update
  { nome: 'domain_produto_media.index', descricao: 'Ver imagem de produto' },
  { nome: 'domain_produto_media.show', descricao: 'Ver imagem de produto' },
  { nome: 'domain_produto_media.store', descricao: 'Criar imagem de produto' },
  { nome: 'domain_produto_media.destroy', descricao: 'Remover/Recuperar imagem de produto' },

  // ==================== CATEGORIAS-PRODUTOS (Relação) ====================
  // NOTA: .except(['update']) - sem update
  {
    nome: 'domain_categorias_produtos.index',
    descricao: 'Listar associações categoria-produto',
  },
  {
    nome: 'domain_categorias_produtos.show',
    descricao: 'Ver associação categoria-produto específica',
  },
  { nome: 'domain_categorias_produtos.store', descricao: 'Associar produto à categoria' },
  {
    nome: 'domain_categorias_produtos.destroy',
    descricao: 'Remover/Recuperar associação categoria-produto',
  },

  // ==================== PRODUTO-CONTRAINDICACOES ====================
  { nome: 'domain_produto_contraindicacoes.index', descricao: 'Listar contraindicações' },
  { nome: 'domain_produto_contraindicacoes.show', descricao: 'Ver contraindicação específica' },
  { nome: 'domain_produto_contraindicacoes.store', descricao: 'Criar contraindicação' },
  { nome: 'domain_produto_contraindicacoes.update', descricao: 'Editar contraindicação' },
  {
    nome: 'domain_produto_contraindicacoes.destroy',
    descricao: 'Remover/Recuperar contraindicação',
  },

  // ==================== PRODUTO-RECOMENDACOES ====================
  { nome: 'domain_produto_recomendacoes.index', descricao: 'Listar recomendações' },
  { nome: 'domain_produto_recomendacoes.show', descricao: 'Ver recomendação específica' },
  { nome: 'domain_produto_recomendacoes.store', descricao: 'Criar recomendação' },
  { nome: 'domain_produto_recomendacoes.update', descricao: 'Editar recomendação' },
  { nome: 'domain_produto_recomendacoes.destroy', descricao: 'Remover/Recuperar recomendação' },

  // ==================== PERMISSAO ====================
  { nome: 'domain_permissao.index', descricao: 'Listar permissões do domínio' },
  { nome: 'domain_permissao.show', descricao: 'Ver permissão específica' },
  { nome: 'domain_permissao.store', descricao: 'Criar permissão' },
  { nome: 'domain_permissao.update', descricao: 'Editar permissão' },
  { nome: 'domain_permissao.destroy', descricao: 'Remover/Recuperar permissão' },

  { nome: 'domain_pos.index', descricao: 'Listar pos do domínio' },
  { nome: 'domain_pos.show', descricao: 'Ver pos específica' },
  { nome: 'domain_pos.store', descricao: 'Criar pos' },
  { nome: 'domain_pos.update', descricao: 'Editar pos' },
  { nome: 'domain_pos.destroy', descricao: 'Remover/Recuperar pos' },
  { nome: 'domain_pos.meu', descricao: 'Listar os meus pos' },

  // ==================== ASSINATURA ====================
  // A subscrição vista pela própria empresa (plano, consumo, cobranças).
  { nome: 'domain_assinatura.estado', descricao: 'Ver o plano e o consumo da empresa' },
  { nome: 'domain_assinatura.planos', descricao: 'Listar os planos disponíveis' },
  { nome: 'domain_assinatura.escolher', descricao: 'Escolher ou mudar de plano' },
  { nome: 'domain_assinatura.cobranca', descricao: 'Emitir/consultar a cobrança em aberto' },

  // ==================== ONBOARDING ====================
  // Configuração inicial da empresa (ramo de actuação + catálogo de arranque).
  { nome: 'domain_onboarding.estado', descricao: 'Ver o estado da configuração inicial' },
  { nome: 'domain_onboarding.ramos', descricao: 'Listar os ramos de actuação disponíveis' },
  { nome: 'domain_onboarding.ramo', descricao: 'Escolher o ramo e semear o catálogo inicial' },
  { nome: 'domain_onboarding.concluir', descricao: 'Concluir a configuração inicial' },

  // User-Pos (associar utilizadores a pontos de venda)
  { nome: 'domain_user_pos.index', descricao: 'Listar associações user-pos' },
  { nome: 'domain_user_pos.show', descricao: 'Ver associação user-pos' },
  { nome: 'domain_user_pos.store', descricao: 'Associar utilizador a um pos' },
  { nome: 'domain_user_pos.destroy', descricao: 'Remover associação user-pos' },

  // ==================== PAPEIS DA PROPRIA EMPRESA ====================
  // A empresa gere os SEUS papeis: cria, edita, apaga e escolhe que permissoes
  // cada um tem. Nao existia — papeis eram partilhados por todos os inquilinos e
  // so o dono da plataforma lhes tocava.
  { nome: 'domain_papel.index', descricao: 'Listar os papéis da empresa' },
  { nome: 'domain_papel.show', descricao: 'Ver um papel da empresa' },
  { nome: 'domain_papel.store', descricao: 'Criar um papel na empresa' },
  { nome: 'domain_papel.update', descricao: 'Editar um papel da empresa e as suas permissões' },
  { nome: 'domain_papel.destroy', descricao: 'Remover/Repor um papel da empresa' },
  {
    nome: 'domain_papel.permissoes_disponiveis',
    descricao: 'Listar o catálogo de permissões atribuíveis',
  },

  // ==================== USER-PAPEL DOMAIN ====================
  { nome: 'domain_user_papel.index', descricao: 'Listar associações usuário-papel' },
  { nome: 'domain_user_papel.show', descricao: 'Ver associação usuário-papel específica' },
  { nome: 'domain_user_papel.store', descricao: 'Associar papel ao usuário' },
  { nome: 'domain_user_papel.update', descricao: 'Editar associação usuário-papel' },
  {
    nome: 'domain_user_papel.destroy',
    descricao: 'Remover/Recuperar associação usuário-papel',
  },
  {
    nome: 'domain_user_papel.papeis_disponiveis',
    descricao: 'Listar papéis de domínio atribuíveis pelos administradores da empresa',
  },
  // ==================== MÉTRICAS DOMAIN ====================
  { nome: 'domain_metricas.resumo', descricao: 'Ver resumo de métricas (dashboard)' },
  { nome: 'domain_metricas.postos', descricao: 'Ver desempenho por posto de venda' },
  { nome: 'domain_metricas.vendedores', descricao: 'Ver desempenho por vendedor' },
  { nome: 'domain_metricas.por_dia', descricao: 'Ver tendência diária de vendas (Controlo)' },
  {
    nome: 'domain_metricas.promotores_resumo',
    descricao: 'Ver o impacto agregado dos promotores nesta empresa',
  },
  { nome: 'domain_metricas.promotores_por_promotor', descricao: 'Ver desempenho por promotor' },
  {
    nome: 'domain_metricas.promotores_por_produto',
    descricao: 'Ver produtos mais vendidos via promotores',
  },
  // ==================== DESPESAS DOMAIN ====================
  { nome: 'domain_despesas.index', descricao: 'Listar despesas da empresa' },
  { nome: 'domain_despesas.show', descricao: 'Ver despesa específica' },
  { nome: 'domain_despesas.store', descricao: 'Registar despesa' },
  { nome: 'domain_despesas.update', descricao: 'Editar despesa' },
  { nome: 'domain_despesas.destroy', descricao: 'Remover/Recuperar despesa' },
  // ==================== RELATORIOS DOMAIN ====================
  { nome: 'domain_relatorios.dashboard_executivo', descricao: 'Ver o dashboard executivo' },
  { nome: 'domain_relatorios.kpis_gerais', descricao: 'Ver os KPIs gerais' },
  { nome: 'domain_relatorios.faturacao_por_periodo', descricao: 'Ver a faturação num período' },
  { nome: 'domain_relatorios.evolucao_vendas', descricao: 'Ver a evolução das vendas' },
  { nome: 'domain_relatorios.top_produtos', descricao: 'Ver os produtos mais vendidos' },
  { nome: 'domain_relatorios.top_categorias', descricao: 'Ver as categorias mais vendidas' },
  { nome: 'domain_relatorios.top_clientes', descricao: 'Ver os clientes que mais compraram' },
  {
    nome: 'domain_relatorios.top_vendedores',
    descricao: 'Ver os vendedores com melhor desempenho',
  },
  { nome: 'domain_relatorios.vendas', descricao: 'Ver o relatório de vendas' },
  { nome: 'domain_relatorios.clientes', descricao: 'Ver o relatório de clientes' },
  {
    nome: 'domain_relatorios.metodo_pagamento',
    descricao: 'Ver o relatório por método de pagamento',
  },
  { nome: 'domain_relatorios.produtos', descricao: 'Ver o relatório de produtos' },
  { nome: 'domain_relatorios.stock', descricao: 'Ver o relatório de stock' },
  { nome: 'domain_relatorios.compras', descricao: 'Ver o relatório de compras' },
  { nome: 'domain_relatorios.lucro', descricao: 'Ver o relatório de lucro' },
  { nome: 'domain_relatorios.impostos', descricao: 'Ver o relatório de impostos' },
  { nome: 'domain_relatorios.utilizadores', descricao: 'Ver o relatório de utilizadores' },
  { nome: 'domain_relatorios.descontos', descricao: 'Ver o relatório de descontos' },
  {
    nome: 'domain_relatorios.documentos_anulados',
    descricao: 'Ver o relatório de documentos anulados',
  },
  { nome: 'domain_relatorios.notas_credito', descricao: 'Ver o relatório de notas de crédito' },
  { nome: 'domain_relatorios.rentabilidade', descricao: 'Ver o relatório de rentabilidade' },
  { nome: 'domain_relatorios.comparativo', descricao: 'Ver os relatórios comparativos' },
  { nome: 'domain_relatorios.fluxo_caixa', descricao: 'Ver o fluxo de caixa' },
  // ==================== FACTURAS DOMAIN ====================
  { nome: 'domain_facturas.index', descricao: 'Listar facturas' },
  { nome: 'domain_facturas.show', descricao: 'Ver factura específica' },
  { nome: 'domain_facturas.store', descricao: 'Emitir factura' },
  { nome: 'domain_facturas.anular', descricao: 'Anular factura' },
  // ==================== CUPOM DOMAIN ====================
  { nome: 'domain_cupom.index', descricao: 'Listar cupões' },
  { nome: 'domain_cupom.show', descricao: 'Ver cupão específico' },
  { nome: 'domain_cupom.store', descricao: 'Criar cupão para um promotor' },
  { nome: 'domain_cupom.update', descricao: 'Editar cupão' },
  { nome: 'domain_cupom.destroy', descricao: 'Remover/Recuperar cupão' },
  // Separada das restantes de propósito: valida um código no ecrã de venda sem dar acesso
  // à gestão de cupões. Vai para os papéis que podem fechar vendas, não para os que gerem.
  { nome: 'domain_cupom.validar', descricao: 'Validar um código de cupão ao fechar uma venda' },
  // ==================== PROMOTORES DOMAIN ====================
  { nome: 'domain_promotores.index', descricao: 'Listar promotores da empresa' },
  { nome: 'domain_promotores.show', descricao: 'Ver promotor específico' },
  { nome: 'domain_promotores.store', descricao: 'Registar um promotor de domínio' },
  { nome: 'domain_promotores.update', descricao: 'Editar/desativar promotor' },
  { nome: 'domain_promotores.destroy', descricao: 'Remover/Recuperar promotor' },
  // ==================== AUTH ====================
  // GET /auth
  { nome: 'domain_auth.me', descricao: 'Ver dados do usuário autenticado' },
  { nome: 'domain_auth.register', descricao: 'Cria um usuario' },
  { nome: 'domain_auth.list', descricao: 'Listar usuarios' },
  { nome: 'domain_auth.show', descricao: 'Listar um usuario' },
  { nome: 'domain_auth.update', descricao: 'Editar um funcionário (username/email)' },
  { nome: 'domain_auth.destroy', descricao: 'Desactivar/reactivar um funcionário' },
  { nome: 'domain_reset.password', descricao: 'Altera a palavra passe' },
  { nome: 'domain_forgot.password', descricao: 'Emite um pedido de recuperação de senha' },

  //===================== PLATFORM =============================
  // ==================== PERMISSAO =============================
  { nome: 'permissao.index', descricao: 'Listar permissões da plataforma' },
  { nome: 'permissao.show', descricao: 'Ver permissão específica' },
  { nome: 'permissao.store', descricao: 'Criar permissão' },
  { nome: 'permissao.update', descricao: 'Editar permissão' },
  { nome: 'permissao.destroy', descricao: 'Remover/Recuperar permissão' },

  // ==================== PAPEL ================================
  { nome: 'papel.index', descricao: 'Listar papéis da plataforma' },
  { nome: 'papel.show', descricao: 'Ver papel específico' },
  { nome: 'papel.store', descricao: 'Criar papel' },
  { nome: 'papel.update', descricao: 'Editar papel' },
  { nome: 'papel.destroy', descricao: 'Remover/Recuperar papel' },

  // ==================== PAPEL-PERMISSAO ====================
  { nome: 'papel_permissao.index', descricao: 'Listar associações papel-permissão' },
  { nome: 'papel_permissao.show', descricao: 'Ver associação papel-permissão específica' },
  { nome: 'papel_permissao.store', descricao: 'Associar permissão ao papel' },
  { nome: 'papel_permissao.update', descricao: 'Editar associação papel-permissão' },
  {
    nome: 'papel_permissao.destroy',
    descricao: 'Remover/Recuperar associação papel-permissão',
  },

  // ==================== USER-PAPEL ====================
  { nome: 'user_papel.index', descricao: 'Listar associações usuário-papel da plataforma' },
  { nome: 'user_papel.show', descricao: 'Ver associação usuário-papel específica' },
  { nome: 'user_papel.store', descricao: 'Associar papel ao usuário' },
  { nome: 'user_papel.update', descricao: 'Editar associação usuário-papel' },
  { nome: 'user_papel.destroy', descricao: 'Remover/Recuperar associação usuário-papel' },

  // GET /auth
  { nome: 'auth.me', descricao: 'Ver dados do usuário autenticado' },
  { nome: 'auth.register', descricao: 'Cria um usuario' },
  { nome: 'auth.destroy', descricao: 'Remover/Recuperar um usuario ou ' },
  { nome: 'auth.list', descricao: 'Listar usuarios' },
  { nome: 'auth.show', descricao: 'Listar um usuario' },
  { nome: 'reset.password', descricao: 'Altera a palavra passe' },
  { nome: 'forgot.password', descricao: 'Emite um pedido de recuperação de senha' },

  // Produto-Marcas
  { nome: 'produto_marcas.index', descricao: 'Listar marcas de produtos' },
  { nome: 'produto_marcas.show', descricao: 'Ver detalhes de uma marca de produto' },
  { nome: 'produto_marcas.store', descricao: 'Criar uma nova marca de produto' },
  { nome: 'produto_marcas.update', descricao: 'Atualizar uma marca de produto' },
  { nome: 'produto_marcas.destroy', descricao: 'Remover uma marca de produto' },

  // Produto-Formatos
  { nome: 'produto_formatos.index', descricao: 'Listar formatos de produtos' },
  { nome: 'produto_formatos.show', descricao: 'Ver detalhes de um formato de produto' },
  { nome: 'produto_formatos.store', descricao: 'Criar um novo formato de produto' },
  { nome: 'produto_formatos.update', descricao: 'Atualizar um formato de produto' },
  { nome: 'produto_formatos.destroy', descricao: 'Remover um formato de produto' },

  // Produto-Categorias
  { nome: 'produto_categorias.index', descricao: 'Listar categorias de produtos' },
  { nome: 'produto_categorias.show', descricao: 'Ver detalhes de uma categoria de produto' },
  { nome: 'produto_categorias.store', descricao: 'Criar uma nova categoria de produto' },
  { nome: 'produto_categorias.update', descricao: 'Atualizar uma categoria de produto' },
  { nome: 'produto_categorias.destroy', descricao: 'Remover uma categoria de produto' },

  // Produto-Fabricantes
  { nome: 'produto_fabricantes.index', descricao: 'Listar fabricantes de produtos' },
  { nome: 'produto_fabricantes.show', descricao: 'Ver detalhes de um fabricante de produto' },
  { nome: 'produto_fabricantes.store', descricao: 'Criar um novo fabricante de produto' },
  { nome: 'produto_fabricantes.update', descricao: 'Atualizar um fabricante de produto' },
  { nome: 'produto_fabricantes.destroy', descricao: 'Remover um fabricante de produto' },

  // Produto-Fornecedores
  { nome: 'produto_fornecedores.index', descricao: 'Listar fornecedores de produtos' },
  { nome: 'produto_fornecedores.show', descricao: 'Ver detalhes de um fornecedor de produto' },
  { nome: 'produto_fornecedores.store', descricao: 'Criar um novo fornecedor de produto' },
  { nome: 'produto_fornecedores.update', descricao: 'Atualizar um fornecedor de produto' },
  { nome: 'produto_fornecedores.destroy', descricao: 'Remover um fornecedor de produto' },

  // Produtos
  { nome: 'produtos.index', descricao: 'Listar produtos' },
  { nome: 'produtos.show', descricao: 'Ver detalhes de um produto' },
  { nome: 'produtos.store', descricao: 'Criar um novo produto' },
  { nome: 'produtos.update', descricao: 'Atualizar um produto' },
  { nome: 'produtos.destroy', descricao: 'Remover um produto' },

  // Produto-Descrições
  { nome: 'produto_descricoes.index', descricao: 'Listar descrições de produtos' },
  { nome: 'produto_descricoes.show', descricao: 'Ver detalhes de uma descrição de produto' },
  { nome: 'produto_descricoes.store', descricao: 'Criar uma nova descrição de produto' },
  { nome: 'produto_descricoes.update', descricao: 'Atualizar uma descrição de produto' },
  { nome: 'produto_descricoes.destroy', descricao: 'Remover uma descrição de produto' },

  // Produto-Imagens
  { nome: 'produto_media.show', descricao: 'Ver imagem de produto' },
  { nome: 'produto_media.store', descricao: 'Adicionar imagem a um produto' },
  { nome: 'produto_media.destroy', descricao: 'Remover imagem de um produto' },

  // Categorias-Produtos
  {
    nome: 'categorias_produtos.index',
    descricao: 'Listar relações entre categorias e produtos',
  },
  { nome: 'categorias_produtos.show', descricao: 'Ver relação entre categoria e produto' },
  { nome: 'categorias_produtos.store', descricao: 'Associar produto a uma categoria' },
  {
    nome: 'categorias_produtos.destroy',
    descricao: 'Remover associação entre produto e categoria',
  },

  // Produto-Contraindicações
  { nome: 'produto_contraindicacoes.index', descricao: 'Listar contraindicações de produtos' },
  { nome: 'produto_contraindicacoes.show', descricao: 'Ver contraindicação de produto' },
  { nome: 'produto_contraindicacoes.store', descricao: 'Criar contraindicação de produto' },
  {
    nome: 'produto_contraindicacoes.update',
    descricao: 'Atualizar contraindicação de produto',
  },
  { nome: 'produto_contraindicacoes.destroy', descricao: 'Remover contraindicação de produto' },

  // Produto-Recomendações
  { nome: 'produto_recomendacoes.index', descricao: 'Listar recomendações de produtos' },
  { nome: 'produto_recomendacoes.show', descricao: 'Ver recomendação de produto' },
  { nome: 'produto_recomendacoes.store', descricao: 'Criar recomendação de produto' },
  { nome: 'produto_recomendacoes.update', descricao: 'Atualizar recomendação de produto' },
  { nome: 'produto_recomendacoes.destroy', descricao: 'Remover recomendação de produto' },

  // Caixa ----------------------------------------
  { nome: 'domain_caixas.index', descricao: 'Listar caixas' },
  { nome: 'domain_caixas.show', descricao: 'Ver um caixa' },
  { nome: 'domain_caixas.store', descricao: 'Criar um caixa' },
  { nome: 'domain_caixas.update', descricao: 'Actualizar o caixa' },
  { nome: 'domain_caixas.destroy', descricao: 'Remover o caixa' },
  { nome: 'domain_caixa.my', descricao: 'Listar os meus caixas' },
  //  Lote
  { nome: 'domain_lote_produto.index', descricao: 'Listar caixas' },
  { nome: 'domain_lote_produto.show', descricao: 'Ver um caixa' },
  { nome: 'domain_lote_produto.store', descricao: 'Criar um caixa' },
  { nome: 'domain_lote_produto.update', descricao: 'Actualizar o caixa' },
  { nome: 'domain_lote_produto.destroy', descricao: 'Remover o caixa' },
  // Estoque
  { nome: 'domain_estoque.index', descricao: 'Listar caixas' },
  { nome: 'domain_estoque.show', descricao: 'Ver um caixa' },
  { nome: 'domain_estoque.store', descricao: 'Criar um caixa' },
  { nome: 'domain_estoque.update', descricao: 'Actualizar o caixa' },
  { nome: 'domain_estoque.destroy', descricao: 'Remover o caixa' },

  // Vendas
  { nome: 'domain_vendas.index', descricao: 'Listar caixas' },
  { nome: 'domain_vendas.show', descricao: 'Ver um caixa' },
  { nome: 'domain_vendas.store', descricao: 'Criar um caixa' },
  { nome: 'domain_vendas.update', descricao: 'Actualizar o caixa' },
  { nome: 'domain_vendas.destroy', descricao: 'Remover o caixa' },
  { nome: 'domain_vendas.anular', descricao: 'Anular uma venda em aberto' },

  // Venda Itens
  { nome: 'domain_vendas_itens.index', descricao: 'Listar caixas' },
  { nome: 'domain_vendas_itens.show', descricao: 'Ver um caixa' },
  { nome: 'domain_vendas_itens.store', descricao: 'Criar um caixa' },
  { nome: 'domain_vendas_itens.update', descricao: 'Actualizar o caixa' },
  { nome: 'domain_vendas_itens.destroy', descricao: 'Remover o caixa' },

  // Reembolso
  { nome: 'domain_reembolso_total', descricao: 'Reembolsar o total de uma venda' },
  { nome: 'domain_reembolso_parcial', descricao: 'Reembolsar parcialmente uma venda' },
  { nome: 'domain_reembolso_consultar', descricao: 'Listar reembolsos' },
  { nome: 'domain_reembolso_consultar_id', descricao: 'Ver reembolsos de uma venda' },

  // ==================== CUPÕES DE PLATAFORMA ====================
  // Estes nomes descreviam o CRUD cross-tenant sobre a tabela `cupom` dos
  // inquilinos, que era o que a rota `platform_cupom` deste projecto fazia. Essa
  // rota foi removida (ver start/routes.ts) e os mesmos nomes passam a designar o
  // que sempre deviam ter designado: os cupões de quem promove a PLATAFORMA, em
  // `plataforma_cupom`, servidos pelo `taesic-backoffice-api`. Os cupões dos
  // inquilinos são `domain_cupom.*`, mais acima.
  { nome: 'platform_cupom.index', descricao: 'Listar cupões de plataforma' },
  { nome: 'platform_cupom.show', descricao: 'Ver um cupão de plataforma' },
  { nome: 'platform_cupom.store', descricao: 'Criar um cupão de plataforma' },
  { nome: 'platform_cupom.update', descricao: 'Editar um cupão de plataforma' },
  { nome: 'platform_cupom.destroy', descricao: 'Remover/Recuperar um cupão de plataforma' },
  { nome: 'platform_cupom.resumo', descricao: 'Ver o resumo de cupões e comissões' },
  { nome: 'platform_cupom.promotores', descricao: 'Listar os promotores de plataforma' },
  {
    nome: 'platform_cupom.subscricoes_sem_cupao',
    descricao: 'Listar as subscrições ainda não atribuídas a um cupão',
  },
  { nome: 'platform_cupom.resgates', descricao: 'Ver os resgates de um cupão de plataforma' },
  {
    nome: 'platform_cupom.registar_resgate',
    descricao: 'Atribuir uma subscrição a um cupão (gera comissão)',
  },
  { nome: 'platform_cupom.anular_resgate', descricao: 'Anular um resgate atribuído por engano' },

  // ==================== PLANO ====================
  { nome: 'platform_plano.index', descricao: 'Listar planos' },
  { nome: 'platform_plano.show', descricao: 'Ver plano específico' },
  { nome: 'platform_plano.store', descricao: 'Criar plano' },
  { nome: 'platform_plano.update', descricao: 'Editar plano' },
  { nome: 'platform_plano.destroy', descricao: 'Remover/Recuperar plano' },

  // ==================== TAXA-IVA (PLATAFORMA) ====================
  { nome: 'platform_taxa_iva.index', descricao: 'Listar taxas de IVA' },
  { nome: 'platform_taxa_iva.show', descricao: 'Ver taxa de IVA específica' },
  { nome: 'platform_taxa_iva.store', descricao: 'Criar taxa de IVA' },
  { nome: 'platform_taxa_iva.update', descricao: 'Editar taxa de IVA' },
  { nome: 'platform_taxa_iva.destroy', descricao: 'Remover/Recuperar taxa de IVA' },

  // ==================== RELATORIOS DA PLATAFORMA (cross-tenant) ====================
  {
    nome: 'platform_relatorios.contas_receber',
    descricao: 'Ver as contas a receber da plataforma (cobranças de subscrição)',
  },
  { nome: 'platform_relatorios.receita', descricao: 'Ver a receita da plataforma' },
  { nome: 'platform_relatorios.empresas_resumo', descricao: 'Ver o resumo das empresas clientes' },
  { nome: 'platform_relatorios.uso', descricao: 'Ver o uso agregado da plataforma' },
  {
    nome: 'platform_relatorios.auditoria',
    descricao: 'Ver o relatório de auditoria (eventos de segurança)',
  },

  // ==================== METODO-PAGAMENTO (DOMAIN — isolado por empresa) ====================
  { nome: 'domain_metodo_pagamento.index', descricao: 'Listar métodos de pagamento da empresa' },
  { nome: 'domain_metodo_pagamento.show', descricao: 'Ver método de pagamento específico' },
  { nome: 'domain_metodo_pagamento.store', descricao: 'Criar método de pagamento' },
  { nome: 'domain_metodo_pagamento.update', descricao: 'Editar método de pagamento' },
  { nome: 'domain_metodo_pagamento.destroy', descricao: 'Remover/Recuperar método de pagamento' },

  // ==================== CLIENTE ====================
  { nome: 'domain_cliente.index', descricao: 'Listar clientes' },
  { nome: 'domain_cliente.show', descricao: 'Ver cliente específico' },
  { nome: 'domain_cliente.store', descricao: 'Criar cliente' },
  { nome: 'domain_cliente.update', descricao: 'Editar cliente' },
  { nome: 'domain_cliente.destroy', descricao: 'Remover/Recuperar cliente' },

  // ==================== NIF (consulta ao portal do contribuinte) ====================
  {
    nome: 'domain_nif.consultar',
    descricao: 'Consultar um NIF no portal do contribuinte (nome, tipo, estado, regime de IVA)',
  },

  // ==================== PESSOA ====================
  { nome: 'domain_pessoa.index', descricao: 'Listar pessoas' },
  { nome: 'domain_pessoa.show', descricao: 'Ver pessoa específica' },
  { nome: 'domain_pessoa.store', descricao: 'Criar pessoa' },
  { nome: 'domain_pessoa.update', descricao: 'Editar pessoa' },
  { nome: 'domain_pessoa.destroy', descricao: 'Remover/Recuperar pessoa' },

  // ==================== VENDAPAGAMENTO ====================
  { nome: 'domain_vendapagamento.index', descricao: 'Listar pagamentos de venda' },
  { nome: 'domain_vendapagamento.show', descricao: 'Ver pagamento de venda específico' },
  { nome: 'domain_vendapagamento.store', descricao: 'Criar pagamento de venda' },
  { nome: 'domain_vendapagamento.update', descricao: 'Editar pagamento de venda' },
  { nome: 'domain_vendapagamento.destroy', descricao: 'Remover/Recuperar pagamento de venda' },

  // ==================== SUBSCRICAO ====================
  { nome: 'domain_subscricao.index', descricao: 'Listar subscrições' },
  { nome: 'domain_subscricao.show', descricao: 'Ver subscrição específica' },
  { nome: 'domain_subscricao.store', descricao: 'Criar subscrição' },
  { nome: 'domain_subscricao.update', descricao: 'Editar subscrição' },
  { nome: 'domain_subscricao.destroy', descricao: 'Remover/Recuperar subscrição' },

  // ==================== COBRANCA ====================
  { nome: 'domain_cobranca.index', descricao: 'Listar cobranças' },
  { nome: 'domain_cobranca.show', descricao: 'Ver cobrança específica' },
  { nome: 'domain_cobranca.store', descricao: 'Criar cobrança' },
  { nome: 'domain_cobranca.update', descricao: 'Editar cobrança' },
  { nome: 'domain_cobranca.destroy', descricao: 'Remover/Recuperar cobrança' },
]

/**
 * As permissões de cada papel MODELO, pelo nome.
 *
 * `Platform_Admin` não está aqui de propósito: as permissões dele são "todas as
 * que não são de inquilino", uma regra e não uma lista, e mantê-la como regra é o
 * que garante que uma permissão de plataforma nova lhe chega sem ninguém se
 * lembrar de a acrescentar em dois sítios. Ver `semearRbacPadrao()`.
 */
export const PERMISSOES_POR_PAPEL: Record<string, string[]> = {
  // ===== ADMIN (Domínio) - Acesso total =====
  Admin: [
    // Produto-Marcas (5 perms)

    'domain_produto_marcas.index',
    'domain_produto_marcas.show',
    'domain_produto_marcas.store',
    'domain_produto_marcas.update',
    'domain_produto_marcas.destroy',

    // Produto-Formatos (5 perms)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',
    'domain_produto_formatos.store',
    'domain_produto_formatos.update',
    'domain_produto_formatos.destroy',

    // Produto-Categorias (5 perms)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',
    'domain_produto_categorias.store',
    'domain_produto_categorias.update',
    'domain_produto_categorias.destroy',

    // Produto-Fabricantes (5 perms)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',
    'domain_produto_fabricantes.store',
    'domain_produto_fabricantes.update',
    'domain_produto_fabricantes.destroy',

    // Produto-Fornecedores (5 perms)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',
    'domain_produto_fornecedores.store',
    'domain_produto_fornecedores.update',
    'domain_produto_fornecedores.destroy',

    // Produtos (5 perms)

    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',
    'domain_produtos.store',
    'domain_produtos.update',
    'domain_produtos.destroy',
    'domain_produtos.registrar_com_detalhes',

    // Produto-Descrições (5 perms)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',
    'domain_produto_descricoes.store',
    'domain_produto_descricoes.update',
    'domain_produto_descricoes.destroy',

    // Produto-Imagens (3 perms - sem index, update)

    'domain_produto_media.index',
    'domain_produto_media.show',
    'domain_produto_media.store',
    'domain_produto_media.destroy',

    // Categorias-Produtos (4 perms - sem update)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',
    'domain_categorias_produtos.store',
    'domain_categorias_produtos.destroy',

    // Produto-Contraindicações (5 perms)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',
    'domain_produto_contraindicacoes.store',
    'domain_produto_contraindicacoes.update',
    'domain_produto_contraindicacoes.destroy',

    // Produto-Recomendações (5 perms)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',
    'domain_produto_recomendacoes.store',
    'domain_produto_recomendacoes.update',
    'domain_produto_recomendacoes.destroy',

    // Papéis da própria empresa (6 perms) — criar, editar, apagar e escolher as
    // permissões de cada papel. Só o Admin escreve: `domain_papel.update` é
    // também a chave que `assertNaoFicaSemGestao` exige que alguém na empresa
    // continue a ter, para nenhuma empresa se conseguir trancar fora da sua
    // própria gestão de acessos.
    'domain_papel.index',
    'domain_papel.show',
    'domain_papel.store',
    'domain_papel.update',
    'domain_papel.destroy',
    'domain_papel.permissoes_disponiveis',

    // User-Papel (6 perms)
    'domain_user_papel.index',
    'domain_user_papel.show',
    'domain_user_papel.store',
    'domain_user_papel.update',
    'domain_user_papel.destroy',
    'domain_user_papel.papeis_disponiveis',

    // Métricas (7 perms)
    'domain_metricas.resumo',
    'domain_metricas.postos',
    'domain_metricas.vendedores',
    'domain_metricas.por_dia',
    'domain_metricas.promotores_resumo',
    'domain_metricas.promotores_por_promotor',
    'domain_metricas.promotores_por_produto',

    // Despesas (5 perms)
    'domain_despesas.index',
    'domain_despesas.show',
    'domain_despesas.store',
    'domain_despesas.update',
    'domain_despesas.destroy',

    // Relatórios (23 perms)
    'domain_relatorios.dashboard_executivo',
    'domain_relatorios.kpis_gerais',
    'domain_relatorios.faturacao_por_periodo',
    'domain_relatorios.evolucao_vendas',
    'domain_relatorios.top_produtos',
    'domain_relatorios.top_categorias',
    'domain_relatorios.top_clientes',
    'domain_relatorios.top_vendedores',
    'domain_relatorios.vendas',
    'domain_relatorios.clientes',
    'domain_relatorios.metodo_pagamento',
    'domain_relatorios.produtos',
    'domain_relatorios.stock',
    'domain_relatorios.compras',
    'domain_relatorios.lucro',
    'domain_relatorios.impostos',
    'domain_relatorios.utilizadores',
    'domain_relatorios.descontos',
    'domain_relatorios.documentos_anulados',
    'domain_relatorios.notas_credito',
    'domain_relatorios.rentabilidade',
    'domain_relatorios.comparativo',
    'domain_relatorios.fluxo_caixa',

    // Facturas (4 perms)
    'domain_facturas.index',
    'domain_facturas.show',
    'domain_facturas.store',
    'domain_facturas.anular',

    // Cupom (5 perms)
    'domain_cupom.index',
    'domain_cupom.show',
    'domain_cupom.store',
    'domain_cupom.update',
    'domain_cupom.destroy',

    // Promotores (5 perms)
    'domain_promotores.index',
    'domain_promotores.show',
    'domain_promotores.store',
    'domain_promotores.update',
    'domain_promotores.destroy',

    // Auth (1 perm)
    'domain_auth.me',
    'domain_auth.register',
    'domain_auth.list',
    'domain_auth.show',
    'domain_auth.update',
    'domain_auth.destroy',
    'domain_reset.password',
    'domain_forgot.password',

    // caixa

    'domain_caixas.index',
    'domain_caixas.show',
    'domain_caixas.store',
    'domain_caixas.destroy',
    'domain_caixa.my',

    // pos
    'domain_pos.index',
    'domain_pos.show',
    'domain_pos.store',
    'domain_pos.update',
    'domain_pos.destroy',
    'domain_pos.meu',

    // onboarding (configuração inicial da empresa)
    'domain_onboarding.estado',
    'domain_onboarding.ramos',
    'domain_onboarding.ramo',
    'domain_onboarding.concluir',

    // assinatura (plano, consumo e pagamento da subscrição)
    'domain_assinatura.estado',
    'domain_assinatura.planos',
    'domain_assinatura.escolher',
    'domain_assinatura.cobranca',

    // user-pos
    'domain_user_pos.index',
    'domain_user_pos.show',
    'domain_user_pos.store',
    'domain_user_pos.destroy',

    // -------
    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',
    'domain_lote_produto.store',
    'domain_lote_produto.update',
    'domain_lote_produto.destroy',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',
    'domain_estoque.store',
    'domain_estoque.update',
    'domain_estoque.destroy',
    // vendas
    'domain_vendas.index',
    'domain_vendas.show',
    'domain_vendas.store',
    'domain_vendas.update',
    'domain_vendas.destroy',
    'domain_cupom.validar',
    'domain_vendas.anular',

    // reembolso
    'domain_reembolso_total',
    'domain_reembolso_parcial',
    'domain_reembolso_consultar',
    'domain_reembolso_consultar_id',

    // venda itens
    'domain_vendas_itens.index',
    'domain_vendas_itens.show',
    'domain_vendas_itens.store',
    'domain_vendas_itens.update',
    'domain_vendas_itens.destroy',
    // cliente
    'domain_cliente.index',
    'domain_nif.consultar',
    'domain_cliente.show',
    'domain_cliente.store',
    'domain_cliente.update',
    'domain_cliente.destroy',
    // pessoa
    'domain_pessoa.index',
    'domain_pessoa.show',
    'domain_pessoa.store',
    'domain_pessoa.update',
    'domain_pessoa.destroy',
    // vendapagamento
    'domain_vendapagamento.index',
    'domain_vendapagamento.show',
    'domain_vendapagamento.store',
    'domain_vendapagamento.update',
    'domain_vendapagamento.destroy',
    // metodo-pagamento (só Admin cria/edita/apaga métodos de pagamento)
    'domain_metodo_pagamento.index',
    'domain_metodo_pagamento.show',
    'domain_metodo_pagamento.store',
    'domain_metodo_pagamento.update',
    'domain_metodo_pagamento.destroy',
    // subscricao
    'domain_subscricao.index',
    'domain_subscricao.show',
    'domain_subscricao.store',
    'domain_subscricao.update',
    'domain_subscricao.destroy',
    // cobranca
    'domain_cobranca.index',
    'domain_cobranca.show',
    'domain_cobranca.store',
    'domain_cobranca.update',
    'domain_cobranca.destroy',
  ],

  // cobranca
  // ===== ESTOQUISTA (Read-Write Produtos) =====
  Estoquista: [
    // Produto-Marcas (5 perms)
    'domain_produto_marcas.index',
    'domain_produto_marcas.show',
    'domain_produto_marcas.store',
    'domain_produto_marcas.update',
    'domain_produto_marcas.destroy',

    // Produto-Formatos (5 perms)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',
    'domain_produto_formatos.store',
    'domain_produto_formatos.update',
    'domain_produto_formatos.destroy',

    // Produto-Categorias (5 perms)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',
    'domain_produto_categorias.store',
    'domain_produto_categorias.update',
    'domain_produto_categorias.destroy',

    // Produto-Fabricantes (5 perms)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',
    'domain_produto_fabricantes.store',
    'domain_produto_fabricantes.update',
    'domain_produto_fabricantes.destroy',

    // Produto-Fornecedores (5 perms)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',
    'domain_produto_fornecedores.store',
    'domain_produto_fornecedores.update',
    'domain_produto_fornecedores.destroy',

    // Produtos (5 perms)
    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',
    'domain_produtos.store',
    'domain_produtos.update',
    'domain_produtos.destroy',
    'domain_produtos.registrar_com_detalhes',

    // Produto-Descrições (5 perms)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',
    'domain_produto_descricoes.store',
    'domain_produto_descricoes.update',
    'domain_produto_descricoes.destroy',

    // Produto-Imagens (3 perms)
    'domain_produto_media.show',
    'domain_produto_media.index',
    'domain_produto_media.store',
    'domain_produto_media.destroy',

    // Categorias-Produtos (4 perms)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',
    'domain_categorias_produtos.store',
    'domain_categorias_produtos.destroy',

    // Produto-Contraindicações (5 perms)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',
    'domain_produto_contraindicacoes.store',
    'domain_produto_contraindicacoes.update',
    'domain_produto_contraindicacoes.destroy',

    // Produto-Recomendações (5 perms)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',
    'domain_produto_recomendacoes.store',
    'domain_produto_recomendacoes.update',
    'domain_produto_recomendacoes.destroy',

    // Auth (1 perm)
    'domain_auth.me',
    'domain_auth.list',
    'domain_reset.password',
    'domain_forgot.password',

    // cai
    'domain_caixas.index',
    'domain_caixas.show',
    // pos
    'domain_pos.index',
    'domain_pos.show',

    // -------
    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',
    'domain_lote_produto.store',
    'domain_lote_produto.update',
    'domain_lote_produto.destroy',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',
    'domain_estoque.store',
    'domain_estoque.update',
    'domain_estoque.destroy',
    // vendas
    'domain_vendas.index',
    'domain_vendas.show',

    // venda itens
    'domain_vendas_itens.index',
    'domain_vendas_itens.show',

    // metodo-pagamento (leitura — precisa de saber que métodos existem)
    'domain_metodo_pagamento.index',
    'domain_metodo_pagamento.show',
  ],

  // vendas
  // venda itens
  // metodo-pagamento (leitura — precisa de saber que métodos existem)
  // ===== ESTOQUISTA VISUALIZADOR (Read-only Produtos) =====
  EstoquistaVisualizador: [
    // Produto-Marcas (read only)
    'domain_produto_marcas.index',
    'domain_produto_marcas.show',

    // Produto-Formatos (read only)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',

    // Produto-Categorias (read only)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',

    // Produto-Fabricantes (read only)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',

    // Produto-Fornecedores (read only)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',

    // Produtos (read only)
    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',

    // Produto-Descrições (read only)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',

    // Produto-Imagens (read only)
    'domain_produto_media.show',
    'domain_produto_media.index',

    // Categorias-Produtos (read only)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',

    // Produto-Contraindicações (read only)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',

    // Produto-Recomendações (read only)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',

    // Auth
    'domain_auth.me',
    'domain_auth.list',
    'domain_auth.show',
    'domain_reset.password',
    'domain_forgot.password',
    'domain_caixas.index',
    'domain_caixas.show',

    // pos
    'domain_pos.index',
    'domain_pos.show',

    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',
  ],

  // pos
  // lote
  // estoque
  // ===== VENDEDOR (Read Produtos) =====
  Vendedor: [
    // Produto-Marcas (read only)
    'domain_produto_marcas.index',
    'domain_produto_marcas.show',

    // Produto-Formatos (read only)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',

    // Produto-Categorias (read only)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',

    // Produto-Fabricantes (read only)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',

    // Produto-Fornecedores (read only)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',

    // Produtos (read only)
    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',

    // Produto-Descrições (read only)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',

    // Produto-Imagens (read only)
    'domain_produto_media.show',
    'domain_produto_media.index',

    // Categorias-Produtos (read only)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',

    // Produto-Contraindicações (read only)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',

    // Produto-Recomendações (read only)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',

    // Auth
    'domain_auth.me',
    'domain_auth.list',
    'domain_auth.show',
    'domain_reset.password',
    'domain_forgot.password',
    // caixa
    'domain_caixas.index',
    'domain_caixas.show',
    'domain_caixas.store',
    'domain_caixas.destroy',
    'domain_caixa.my',

    // pos
    'domain_pos.index',
    'domain_pos.show',
    'domain_pos.store',
    'domain_pos.update',
    'domain_pos.destroy',
    'domain_pos.meu',

    // -------
    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',

    // vendas
    'domain_vendas.index',
    'domain_vendas.show',
    'domain_vendas.store',
    'domain_vendas.update',
    'domain_vendas.destroy',
    'domain_cupom.validar',
    'domain_vendas.anular',

    // reembolso
    'domain_reembolso_total',
    'domain_reembolso_parcial',
    'domain_reembolso_consultar',
    'domain_reembolso_consultar_id',
    // venda itens
    'domain_vendas_itens.index',
    'domain_vendas_itens.show',
    'domain_vendas_itens.store',
    'domain_vendas_itens.update',
    'domain_vendas_itens.destroy',

    // metodo-pagamento (leitura — precisa de saber que métodos existem)
    'domain_metodo_pagamento.index',
    'domain_metodo_pagamento.show',

    // pagamentos da venda — sem isto NÃO existe venda nenhuma: desde que close() passou
    // a exigir pelo menos um vendapagamento cuja soma bate certo com o total (ver 7.4),
    // registar o pagamento é um passo obrigatório do fluxo. Editar/apagar um pagamento
    // já registado continua só no Admin — mexe em dinheiro que a caixa já contabilizou.
    'domain_vendapagamento.index',
    'domain_vendapagamento.show',
    'domain_vendapagamento.store',
    // corrigir/remover um pagamento SÓ é possível enquanto a venda está aberta — a
    // regra é imposta em vendapagamento_repository, não por permissão (ver 7.12).
    'domain_vendapagamento.update',
    'domain_vendapagamento.destroy',

    // facturas (emitir, nunca anular — só o Admin anula)
    'domain_facturas.index',
    'domain_facturas.show',
    'domain_facturas.store',
    // cupom (leitura — precisa de saber que cupons existem)
    'domain_cupom.index',
    'domain_cupom.show',
    // registrar clientes
    'domain_cliente.index',
    'domain_nif.consultar',
    'domain_cliente.show',
    'domain_cliente.store',
    'domain_cliente.update',
    'domain_cliente.destroy',
  ],

  // cupom (leitura — precisa de saber que cupons existem)
  // registrar clientes
  // ===== VENDEDOR VISUALIZADOR (Read-only Produtos) =====
  VendedorVisualizador: [
    // Produto-Marcas (read only)
    'domain_produto_marcas.index',
    'domain_produto_marcas.show',

    // Produto-Formatos (read only)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',

    // Produto-Categorias (read only)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',

    // Produto-Fabricantes (read only)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',

    // Produto-Fornecedores (read only)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',

    // Produtos (read only)
    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',

    // Produto-Descrições (read only)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',

    // Produto-Imagens (read only)
    'domain_produto_media.show',
    'domain_produto_media.index',

    // Categorias-Produtos (read only)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',

    // Produto-Contraindicações (read only)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',

    // Produto-Recomendações (read only)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',

    // Auth
    'domain_auth.me',
    'domain_auth.list',
    'domain_auth.show',
    'domain_reset.password',
    'domain_forgot.password',

    //
    'domain_caixas.index',
    'domain_caixas.show',

    // pos
    'domain_pos.index',
    'domain_pos.show',

    // -------
    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',

    // vendas
    'domain_vendas.index',
    'domain_vendas.show',

    // venda itens
    'domain_vendas_itens.index',
    'domain_vendas_itens.show',
    // metodo-pagamento (leitura — precisa de saber que métodos existem)
    'domain_metodo_pagamento.index',
    'domain_metodo_pagamento.show',
    // facturas (emitir, nunca anular — só o Admin anula)
    'domain_facturas.index',
    'domain_facturas.show',
    // cupom (leitura — precisa de saber que cupons existem)
    'domain_cupom.index',
    'domain_cupom.show',
    // ver dados de clientes
    'domain_cliente.index',
    'domain_nif.consultar',
    'domain_cliente.show',
  ],

  // tratá-los como "gestão" (ex.: caixa_repository.close/reopen/destroy permite a um
  // Admin/Gerente/Supervisor agir sobre a caixa de outro utilizador). Recebem o mesmo
  // conjunto do Vendedor — o suficiente para essas rotas — mais visibilidade de desempenho
  // da loja (métricas de vendas, não as de promotores/marketing).
  Gerente: [
    // Consulta de NIF — Gerente/Supervisor também fecham vendas, por isso precisam de
    // identificar o cliente pelo NIF tal como o Vendedor.
    'domain_nif.consultar',

    // Produto-Marcas (read only)
    'domain_produto_marcas.index',
    'domain_produto_marcas.show',

    // Produto-Formatos (read only)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',

    // Produto-Categorias (read only)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',

    // Produto-Fabricantes (read only)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',

    // Produto-Fornecedores (read only)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',

    // Produtos (read only)
    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',

    // Produto-Descrições (read only)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',

    // Produto-Imagens (read only)
    'domain_produto_media.show',
    'domain_produto_media.index',

    // Categorias-Produtos (read only)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',

    // Produto-Contraindicações (read only)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',

    // Produto-Recomendações (read only)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',

    // Auth
    'domain_auth.me',
    'domain_auth.list',
    'domain_auth.show',
    'domain_reset.password',
    'domain_forgot.password',

    // caixa
    'domain_caixas.index',
    'domain_caixas.show',
    'domain_caixas.store',
    'domain_caixas.destroy',
    'domain_caixa.my',

    // pos
    'domain_pos.index',
    'domain_pos.show',
    'domain_pos.store',
    'domain_pos.update',
    'domain_pos.destroy',
    'domain_pos.meu',

    // onboarding (só leitura — a configuração inicial é do Admin)
    'domain_onboarding.estado',
    'domain_onboarding.ramos',

    // assinatura (só leitura — mudar de plano e pagar é do dono da empresa)
    'domain_assinatura.estado',
    'domain_assinatura.planos',

    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',

    // vendas
    'domain_vendas.index',
    'domain_vendas.show',
    'domain_vendas.store',
    'domain_vendas.update',
    'domain_vendas.destroy',
    'domain_cupom.validar',
    'domain_vendas.anular',

    // reembolso
    'domain_reembolso_total',
    'domain_reembolso_parcial',
    'domain_reembolso_consultar',
    'domain_reembolso_consultar_id',

    // venda itens
    'domain_vendas_itens.index',
    'domain_vendas_itens.show',
    'domain_vendas_itens.store',
    'domain_vendas_itens.update',
    'domain_vendas_itens.destroy',

    // metodo-pagamento (leitura — precisa de saber que métodos existem)
    'domain_metodo_pagamento.index',
    'domain_metodo_pagamento.show',

    // pagamentos da venda — sem isto NÃO existe venda nenhuma: desde que close() passou
    // a exigir pelo menos um vendapagamento cuja soma bate certo com o total (ver 7.4),
    // registar o pagamento é um passo obrigatório do fluxo. Editar/apagar um pagamento
    // já registado continua só no Admin — mexe em dinheiro que a caixa já contabilizou.
    'domain_vendapagamento.index',
    'domain_vendapagamento.show',
    'domain_vendapagamento.store',
    // corrigir/remover um pagamento SÓ é possível enquanto a venda está aberta — a
    // regra é imposta em vendapagamento_repository, não por permissão (ver 7.12).
    'domain_vendapagamento.update',
    'domain_vendapagamento.destroy',

    // facturas (emitir, nunca anular — só o Admin anula)
    'domain_facturas.index',
    'domain_facturas.show',
    'domain_facturas.store',

    // métricas de desempenho da loja (não as de promotores/marketing)
    'domain_metricas.resumo',
    'domain_metricas.postos',
    'domain_metricas.vendedores',
    'domain_metricas.por_dia',

    // despesas (sem destroy — não apagam despesas já registadas, só o Admin apaga)
    'domain_despesas.index',
    'domain_despesas.show',
    'domain_despesas.store',
    'domain_despesas.update',

    // relatórios — acesso completo, é exactamente o que este papel de gestão precisa
    'domain_relatorios.dashboard_executivo',
    'domain_relatorios.kpis_gerais',
    'domain_relatorios.faturacao_por_periodo',
    'domain_relatorios.evolucao_vendas',
    'domain_relatorios.top_produtos',
    'domain_relatorios.top_categorias',
    'domain_relatorios.top_clientes',
    'domain_relatorios.top_vendedores',
    'domain_relatorios.vendas',
    'domain_relatorios.clientes',
    'domain_relatorios.metodo_pagamento',
    'domain_relatorios.produtos',
    'domain_relatorios.stock',
    'domain_relatorios.compras',
    'domain_relatorios.lucro',
    'domain_relatorios.impostos',
    'domain_relatorios.utilizadores',
    'domain_relatorios.descontos',
    'domain_relatorios.documentos_anulados',
    'domain_relatorios.notas_credito',
    'domain_relatorios.rentabilidade',
    'domain_relatorios.comparativo',
    'domain_relatorios.fluxo_caixa',
  ],

  // ===== SUPERVISOR (mesmo conjunto do Gerente — ver comentário acima) =====
  Supervisor: [
    // Consulta de NIF — ver comentário no bloco do Gerente.
    'domain_nif.consultar',

    // Produto-Marcas (read only)
    'domain_produto_marcas.index',
    'domain_produto_marcas.show',

    // Produto-Formatos (read only)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',

    // Produto-Categorias (read only)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',

    // Produto-Fabricantes (read only)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',

    // Produto-Fornecedores (read only)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',

    // Produtos (read only)
    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',

    // Produto-Descrições (read only)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',

    // Produto-Imagens (read only)
    'domain_produto_media.show',
    'domain_produto_media.index',

    // Categorias-Produtos (read only)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',

    // Produto-Contraindicações (read only)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',

    // Produto-Recomendações (read only)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',

    // Auth
    'domain_auth.me',
    'domain_auth.list',
    'domain_auth.show',
    'domain_reset.password',
    'domain_forgot.password',

    // caixa
    'domain_caixas.index',
    'domain_caixas.show',
    'domain_caixas.store',
    'domain_caixas.destroy',
    'domain_caixa.my',

    // pos
    'domain_pos.index',
    'domain_pos.show',
    'domain_pos.store',
    'domain_pos.update',
    'domain_pos.destroy',
    'domain_pos.meu',

    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',

    // vendas
    'domain_vendas.index',
    'domain_vendas.show',
    'domain_vendas.store',
    'domain_vendas.update',
    'domain_vendas.destroy',
    'domain_cupom.validar',
    'domain_vendas.anular',

    // reembolso
    'domain_reembolso_total',
    'domain_reembolso_parcial',
    'domain_reembolso_consultar',
    'domain_reembolso_consultar_id',

    // venda itens
    'domain_vendas_itens.index',
    'domain_vendas_itens.show',
    'domain_vendas_itens.store',
    'domain_vendas_itens.update',
    'domain_vendas_itens.destroy',

    // metodo-pagamento (leitura — precisa de saber que métodos existem)
    'domain_metodo_pagamento.index',
    'domain_metodo_pagamento.show',

    // pagamentos da venda — sem isto NÃO existe venda nenhuma: desde que close() passou
    // a exigir pelo menos um vendapagamento cuja soma bate certo com o total (ver 7.4),
    // registar o pagamento é um passo obrigatório do fluxo. Editar/apagar um pagamento
    // já registado continua só no Admin — mexe em dinheiro que a caixa já contabilizou.
    'domain_vendapagamento.index',
    'domain_vendapagamento.show',
    'domain_vendapagamento.store',
    // corrigir/remover um pagamento SÓ é possível enquanto a venda está aberta — a
    // regra é imposta em vendapagamento_repository, não por permissão (ver 7.12).
    'domain_vendapagamento.update',
    'domain_vendapagamento.destroy',

    // facturas (emitir, nunca anular — só o Admin anula)
    'domain_facturas.index',
    'domain_facturas.show',
    'domain_facturas.store',

    // métricas de desempenho da loja (não as de promotores/marketing)
    'domain_metricas.resumo',
    'domain_metricas.postos',
    'domain_metricas.vendedores',
    'domain_metricas.por_dia',

    // despesas (sem destroy — não apagam despesas já registadas, só o Admin apaga)
    'domain_despesas.index',
    'domain_despesas.show',
    'domain_despesas.store',
    'domain_despesas.update',

    // relatórios — acesso completo, é exactamente o que este papel de gestão precisa
    'domain_relatorios.dashboard_executivo',
    'domain_relatorios.kpis_gerais',
    'domain_relatorios.faturacao_por_periodo',
    'domain_relatorios.evolucao_vendas',
    'domain_relatorios.top_produtos',
    'domain_relatorios.top_categorias',
    'domain_relatorios.top_clientes',
    'domain_relatorios.top_vendedores',
    'domain_relatorios.vendas',
    'domain_relatorios.clientes',
    'domain_relatorios.metodo_pagamento',
    'domain_relatorios.produtos',
    'domain_relatorios.stock',
    'domain_relatorios.compras',
    'domain_relatorios.lucro',
    'domain_relatorios.impostos',
    'domain_relatorios.utilizadores',
    'domain_relatorios.descontos',
    'domain_relatorios.documentos_anulados',
    'domain_relatorios.notas_credito',
    'domain_relatorios.rentabilidade',
    'domain_relatorios.comparativo',
    'domain_relatorios.fluxo_caixa',
  ],

  // ===== ADMIN VISUALIZADOR (Read-only geral) =====
  AdminVisualizador: [
    // Produto-Marcas (read only)
    'domain_produto_marcas.index',
    'domain_produto_marcas.show',

    // Produto-Formatos (read only)
    'domain_produto_formatos.index',
    'domain_produto_formatos.show',

    // Produto-Categorias (read only)
    'domain_produto_categorias.index',
    'domain_produto_categorias.show',

    // Produto-Fabricantes (read only)
    'domain_produto_fabricantes.index',
    'domain_produto_fabricantes.show',

    // Produto-Fornecedores (read only)
    'domain_produto_fornecedores.index',
    'domain_produto_fornecedores.show',

    // Produtos (read only)
    'domain_produtos.index',
    'domain_produtos.show',
    'domain_produtos.catalogo',
    'domain_produtos.alertas',

    // Produto-Descrições (read only)
    'domain_produto_descricoes.index',
    'domain_produto_descricoes.show',

    // Produto-Imagens (read only)
    'domain_produto_media.show',
    'domain_produto_media.index',

    // Categorias-Produtos (read only)
    'domain_categorias_produtos.index',
    'domain_categorias_produtos.show',

    // Produto-Contraindicações (read only)
    'domain_produto_contraindicacoes.index',
    'domain_produto_contraindicacoes.show',

    // Produto-Recomendações (read only)
    'domain_produto_recomendacoes.index',
    'domain_produto_recomendacoes.show',

    // Papel (read only)
    'domain_papel.index',
    'domain_papel.show',
    'domain_papel.permissoes_disponiveis',

    // Permissão (read only)
    'domain_permissao.index',
    'domain_permissao.show',

    // User-Papel (read only)
    'domain_user_papel.index',
    'domain_user_papel.show',
    'domain_user_papel.papeis_disponiveis',

    // Métricas (read only)
    'domain_metricas.resumo',
    'domain_metricas.postos',
    'domain_metricas.vendedores',
    'domain_metricas.por_dia',
    'domain_metricas.promotores_resumo',
    'domain_metricas.promotores_por_promotor',
    'domain_metricas.promotores_por_produto',

    // Facturas (read only)
    'domain_facturas.index',
    'domain_facturas.show',

    // Cupom (read only)
    'domain_cupom.index',
    'domain_cupom.show',

    // Promotores (read only)
    'domain_promotores.index',
    'domain_promotores.show',

    // Auth
    'domain_auth.me',
    'domain_auth.list',
    'domain_auth.show',
    'domain_reset.password',
    'domain_forgot.password',

    'domain_caixas.index',
    'domain_caixas.show',
    // pos
    'domain_pos.index',
    'domain_pos.show',

    // -------
    // lote
    'domain_lote_produto.index',
    'domain_lote_produto.show',

    // estoque
    'domain_estoque.index',
    'domain_estoque.show',

    // vendas
    'domain_vendas.index',
    'domain_vendas.show',

    // venda itens
    'domain_vendas_itens.index',
    'domain_vendas_itens.show',

    // despesas (read-only)
    'domain_despesas.index',
    'domain_despesas.show',

    // relatórios (read-only por natureza — todas as rotas de relatórios são GET)
    'domain_relatorios.dashboard_executivo',
    'domain_relatorios.kpis_gerais',
    'domain_relatorios.faturacao_por_periodo',
    'domain_relatorios.evolucao_vendas',
    'domain_relatorios.top_produtos',
    'domain_relatorios.top_categorias',
    'domain_relatorios.top_clientes',
    'domain_relatorios.top_vendedores',
    'domain_relatorios.vendas',
    'domain_relatorios.clientes',
    'domain_relatorios.metodo_pagamento',
    'domain_relatorios.produtos',
    'domain_relatorios.stock',
    'domain_relatorios.compras',
    'domain_relatorios.lucro',
    'domain_relatorios.impostos',
    'domain_relatorios.utilizadores',
    'domain_relatorios.descontos',
    'domain_relatorios.documentos_anulados',
    'domain_relatorios.notas_credito',
    'domain_relatorios.rentabilidade',
    'domain_relatorios.comparativo',
    'domain_relatorios.fluxo_caixa',
  ],

  // ===== ADMIN USER MANAGER (Gestão de Usuários e Papéis) =====
  AdminUserManager: [
    // Papel (gerenciar)
    'domain_papel.index',
    'domain_papel.show',
    'domain_papel.permissoes_disponiveis',

    // User-Papel (gerenciar) — 'domain_auth_papel.index' era um typo sem rota
    // correspondente (permissão órfã); o nome certo é 'domain_user_papel.index'.
    'domain_user_papel.index',
    'domain_user_papel.show',
    'domain_user_papel.store',
    'domain_user_papel.update',
    'domain_user_papel.destroy',
    'domain_user_papel.papeis_disponiveis',

    // User-Pos (associar utilizadores a pontos de venda)
    'domain_user_pos.index',
    'domain_user_pos.show',
    'domain_user_pos.store',
    'domain_user_pos.destroy',

    // Auth
    'domain_auth.me',
    'domain_auth.register',
    'domain_auth.list',
    'domain_auth.show',
    'domain_auth.update',
    'domain_auth.destroy',
    'domain_reset.password',
    'domain_forgot.password',
  ],

  // Auth
  // ===== ADMIN USER VISUALIZADOR (Visualizar Usuários) =====
  AdminUserVisualizador: [
    // User-Papel (read only)
    'domain_user_papel.index',
    'domain_user_papel.show',
    'domain_user_papel.papeis_disponiveis',

    // Papel (read only)
    'domain_papel.index',
    'domain_papel.show',
    'domain_papel.permissoes_disponiveis',

    // Permissão (read only)
    'domain_permissao.index',
    'domain_permissao.show',

    // Auth
    // 'domain_auth.me',
    'domain_auth.register',
    'domain_auth.list',
    'domain_auth.show',
    'domain_reset.password',
    'domain_forgot.password',
  ],
}

/** O que uma corrida de `semearRbacPadrao()` acrescentou. Tudo a zeros = nada a fazer. */
export interface ResumoRbac {
  papeis: number
  permissoes: number
  ligacoes: number
}

/**
 * Põe o catálogo RBAC na base de dados. **Idempotente**: só cria o que falta.
 *
 * É esta a diferença que justifica a extracção. `database_seeder.ts` não pode
 * correr duas vezes (`Users.createMany` rebenta com emails repetidos), portanto
 * uma permissão nova só chegava a uma base com dados por `node ace
 * permissao:conceder`, um comando por permissão. Isto corre em qualquer base, as
 * vezes que forem precisas, e é o que `node ace rbac:semear` chama num deploy.
 *
 * **Só acrescenta.** Nunca apaga um papel, uma permissão ou uma ligação que já
 * exista, e nunca reescreve uma descrição. Um papel afinado à mão no backoffice não
 * pode ser revertido pelo deploy seguinte — é a mesma regra de `semearPlanosPadrao()`.
 * O reverso disto é que RETIRAR uma permissão a um papel padrão não acontece aqui:
 * para isso há `node ace permissao:revogar`, que é uma decisão deliberada e não um
 * efeito de arranque.
 *
 * Não mexe nos papéis de `escopo: 'empresa'`. Os das empresas são cópias, feitas no
 * registo por `clonarPapeisPadrao()`; afinar um modelo aqui só chega às empresas
 * criadas a partir de então, e alcançar as que já existem é
 * `node ace permissao:conceder <perm> <papel> --todas-empresas`.
 */
export async function semearRbacPadrao(trx?: TransactionClientContract): Promise<ResumoRbac> {
  const resumo: ResumoRbac = { papeis: 0, permissoes: 0, ligacoes: 0 }

  // ── Permissões ──────────────────────────────────────────────────────────────
  const permsExistentes = new Set(
    (await Permissao.query({ client: trx }).select('nome')).map((p) => p.nome)
  )
  const permsEmFalta = PERMISSOES_PADRAO.filter((p) => !permsExistentes.has(p.nome))
  if (permsEmFalta.length > 0) {
    await Permissao.createMany(permsEmFalta, { client: trx })
    resumo.permissoes = permsEmFalta.length
  }

  // ── Papéis ──────────────────────────────────────────────────────────────────
  // Só `modelo` e `plataforma`: ambos têm `empresa_id` NULL, e é isso que os torna
  // globais. Comparar por (nome, escopo) e não só por nome — existe um "Vendedor"
  // modelo e um "Vendedor" por empresa, e são papéis diferentes.
  const papeisExistentes = new Set(
    (
      await Papel.query({ client: trx })
        .whereIn('escopo', [ESCOPO_PAPEL.modelo, ESCOPO_PAPEL.plataforma])
        .whereNull('empresa_id')
        .select('nome', 'escopo')
    ).map((p) => `${p.escopo}:${p.nome}`)
  )
  const papeisEmFalta = PAPEIS_PADRAO.filter((p) => !papeisExistentes.has(`${p.escopo}:${p.nome}`))
  if (papeisEmFalta.length > 0) {
    await Papel.createMany(papeisEmFalta, { client: trx })
    resumo.papeis = papeisEmFalta.length
  }

  // ── Ligações papel -> permissão ─────────────────────────────────────────────
  const papeis = await Papel.query({ client: trx })
    .whereIn('escopo', [ESCOPO_PAPEL.modelo, ESCOPO_PAPEL.plataforma])
    .whereNull('empresa_id')
    .whereNull('deleted_at')
  const permissoes = await Permissao.query({ client: trx }).whereNull('deleted_at')

  const idDaPermissao = new Map(permissoes.map((p) => [p.nome, p.id]))
  const papelPorChave = new Map(papeis.map((p) => [`${p.escopo}:${p.nome}`, p]))

  /**
   * `Platform_Admin` recebe tudo o que NÃO seja de inquilino, como regra e não como
   * lista. Uma permissão de plataforma nova passa a chegar-lhe sozinha — que era
   * exactamente o comportamento do seeder original, e a razão de não estar na matriz.
   */
  const desejadas = new Map<string, string[]>()
  for (const [nome, perms] of Object.entries(PERMISSOES_POR_PAPEL)) {
    desejadas.set(`${ESCOPO_PAPEL.modelo}:${nome}`, perms)
  }
  desejadas.set(
    `${ESCOPO_PAPEL.plataforma}:Platform_Admin`,
    permissoes.filter((p) => !p.nome.startsWith('domain_')).map((p) => p.nome)
  )

  const jaLigado = new Set(
    (await PapelPermissao.query({ client: trx }).select('papel_id', 'permissao_id')).map(
      (l) => `${l.papel_id}:${l.permissao_id}`
    )
  )

  const novas: { papel_id: string; permissao_id: string }[] = []
  for (const [chave, nomes] of desejadas) {
    const papel = papelPorChave.get(chave)
    if (!papel) continue // papel apagado à mão: não é este o sítio para o repor
    for (const nome of new Set(nomes)) {
      const permissaoId = idDaPermissao.get(nome)
      if (!permissaoId) continue // permissão que já não existe no catálogo
      if (jaLigado.has(`${papel.id}:${permissaoId}`)) continue
      novas.push({ papel_id: papel.id, permissao_id: permissaoId })
    }
  }

  // Em lotes: são ~880 ligações numa base nova, e uma inserção por linha são ~880
  // idas à base de dados.
  for (let i = 0; i < novas.length; i += 500) {
    await PapelPermissao.createMany(novas.slice(i, i + 500), { client: trx })
  }
  resumo.ligacoes = novas.length

  return resumo
}
