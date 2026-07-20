import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Users from '#models/user'
import Papel from '#models/auth/papel'
import Permissao from '#models/auth/permissao'
// import UserPapel from '#models/auth/user_papel'
// import PapelPermissao from '#models/auth/papel_permissao'
import { givePermissionsToRole, giveRoleToUser } from '../../app/helpers/Utils.js'
import VerificationTokenHash from '#models/verification_token_hash'

export default class extends BaseSeeder {
  async run() {
    // ================= CRIAR USUÁRIOS =================
    await Users.createMany([
      {
        username: 'jose.baptista99',
        email: 'josebaptistatest99@example.com',
        password: '1234567890aA#',
      },
      {
        username: 'benedito.ciloca',
        email: 'beneditociloca@gmail.com',
        password: '1234567890aA$',
      },
      {
        username: 'carla.morais',
        email: 'carlamorais@gmail.com',
        password: '1234567890aA%',
      },
    ])
    // ================ CRIAR TOKENS DE VERIFICAÇÃO =================
    await VerificationTokenHash.createMany([
      {
        purpose: 'account_activation',
        verified: true,
        user_id: (await Users.findBy('email', 'josebaptistatest99@example.com'))?.id || '',
      },
      {
        purpose: 'account_activation',
        verified: true,
        user_id: (await Users.findBy('email', 'beneditociloca@gmail.com'))?.id || '',
      },
      {
        purpose: 'account_activation',
        verified: true,
        user_id: (await Users.findBy('email', 'carlamorais@gmail.com'))?.id || '',
      },
    ])

    // ================= CRIAR PAPÉIS =================
    // ===== DOMÍNIO ESPECÍFICO (Tenant-based) =====
    await Papel.createMany([
      {
        nome: 'Admin',
        descricao: 'Administrador do domínio/empresa',
      },
      {
        nome: 'Estoquista',
        descricao: 'Responsável por gerenciar o estoque do domínio',
      },
      {
        nome: 'EstoquistaVisualizador',
        descricao: 'Visualizador de estoque do domínio',
      },
      {
        nome: 'Vendedor',
        descricao: 'Responsável por gerenciar as vendas do domínio',
      },
      {
        nome: 'VendedorVisualizador',
        descricao: 'Visualizador de vendas do domínio',
      },
      {
        nome: 'AdminVisualizador',
        descricao: 'Visualizador geral do domínio (read-only)',
      },
      {
        nome: 'AdminUserManager',
        descricao: 'Gerenciador de usuários do domínio',
      },
      {
        nome: 'AdminUserVisualizador',
        descricao: 'Visualizador de usuários do domínio',
      },

      // ===== PLATAFORMA (Global) =====
      {
        nome: 'Platform_Admin',
        descricao: 'Administrador da plataforma (acesso total)',
      },
      {
        nome: 'Platform_Manager',
        descricao: 'Gerente da plataforma (gestão de empresas/usuários)',
      },
      {
        nome: 'Platform_User',
        descricao: 'Usuário normal da plataforma (consulta apenas)',
      },
      {
        nome: 'Platform_Manager_Visualizer',
        descricao: 'Gerente de plataforma com acesso read-only',
      },
      {
        nome: 'Platform_Admin_Visualizer',
        descricao: 'Administrador de plataforma com acesso read-only',
      },
    ])

    // ================= CRIAR PERMISSÕES =================
    await Permissao.createMany([
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
        nome: 'domain_produtos.registrar_com_detalhes',
        descricao: 'Registar produto com detalhes (descrições, categorias, contraindicações, recomendações)',
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

      // User-Pos (associar utilizadores a pontos de venda)
      { nome: 'domain_user_pos.index', descricao: 'Listar associações user-pos' },
      { nome: 'domain_user_pos.show', descricao: 'Ver associação user-pos' },
      { nome: 'domain_user_pos.store', descricao: 'Associar utilizador a um pos' },
      { nome: 'domain_user_pos.destroy', descricao: 'Remover associação user-pos' },

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
      { nome: 'domain_metricas.promotores_resumo', descricao: 'Ver o impacto agregado dos promotores nesta empresa' },
      { nome: 'domain_metricas.promotores_por_promotor', descricao: 'Ver desempenho por promotor' },
      { nome: 'domain_metricas.promotores_por_produto', descricao: 'Ver produtos mais vendidos via promotores' },
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

      // ==================== CUPOM ====================
      { nome: 'platform_cupom.index', descricao: 'Listar cupons' },
      { nome: 'platform_cupom.show', descricao: 'Ver cupom específico' },
      { nome: 'platform_cupom.store', descricao: 'Criar cupom' },
      { nome: 'platform_cupom.update', descricao: 'Editar cupom' },
      { nome: 'platform_cupom.destroy', descricao: 'Remover/Recuperar cupom' },

      // ==================== PLANO ====================
      { nome: 'platform_plano.index', descricao: 'Listar planos' },
      { nome: 'platform_plano.show', descricao: 'Ver plano específico' },
      { nome: 'platform_plano.store', descricao: 'Criar plano' },
      { nome: 'platform_plano.update', descricao: 'Editar plano' },
      { nome: 'platform_plano.destroy', descricao: 'Remover/Recuperar plano' },

      // ==================== METODO-PAGAMENTO ====================
      { nome: 'platform_metodo_pagamento.index', descricao: 'Listar métodos de pagamento' },
      { nome: 'platform_metodo_pagamento.show', descricao: 'Ver método de pagamento específico' },
      { nome: 'platform_metodo_pagamento.store', descricao: 'Criar método de pagamento' },
      { nome: 'platform_metodo_pagamento.update', descricao: 'Editar método de pagamento' },
      { nome: 'platform_metodo_pagamento.destroy', descricao: 'Remover/Recuperar método de pagamento' },

      // ==================== CLIENTE ====================
      { nome: 'domain_cliente.index', descricao: 'Listar clientes' },
      { nome: 'domain_cliente.show', descricao: 'Ver cliente específico' },
      { nome: 'domain_cliente.store', descricao: 'Criar cliente' },
      { nome: 'domain_cliente.update', descricao: 'Editar cliente' },
      { nome: 'domain_cliente.destroy', descricao: 'Remover/Recuperar cliente' },

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
    ])

    // ===== ADMIN (Domínio) - Acesso total =====
    await givePermissionsToRole('Admin', [
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
    ])

    // ===== ESTOQUISTA (Read-Write Produtos) =====
    await givePermissionsToRole('Estoquista', [
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
    ])

    // ===== ESTOQUISTA VISUALIZADOR (Read-only Produtos) =====
    await givePermissionsToRole('EstoquistaVisualizador', [
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
    ])

    // ===== VENDEDOR (Read Produtos) =====
    await givePermissionsToRole('Vendedor', [
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

      // facturas (emitir, nunca anular — só o Admin anula)
      'domain_facturas.index',
      'domain_facturas.show',
      'domain_facturas.store',
    ])

    // ===== VENDEDOR VISUALIZADOR (Read-only Produtos) =====
    await givePermissionsToRole('VendedorVisualizador', [
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
    ])

    // ===== ADMIN VISUALIZADOR (Read-only geral) =====
    await givePermissionsToRole('AdminVisualizador', [
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
    ])

    // ===== ADMIN USER MANAGER (Gestão de Usuários e Papéis) =====
    await givePermissionsToRole('AdminUserManager', [
      // Papel (gerenciar)
      'domain_papel.index',
      'domain_papel.show',

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
      'domain_reset.password',
      'domain_forgot.password',
    ])

    // ===== ADMIN USER VISUALIZADOR (Visualizar Usuários) =====
    await givePermissionsToRole('AdminUserVisualizador', [
      // User-Papel (read only)
      'domain_user_papel.index',
      'domain_user_papel.show',
      'domain_user_papel.papeis_disponiveis',

      // Papel (read only)
      'domain_papel.index',
      'domain_papel.show',

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
    ])

    // ===============================================================================
    // ================= ASSOCIAR PERMISSÕES AOS PAPÉIS DE PLATAFORMA ==============
    // ===============================================================================

    // ===== PLATFORM_ADMIN =====
    // whereNot('nome', 'domain_%') faz igualdade exata (<>), não LIKE — usar o comparador
    // explícito para de facto excluir as permissões de tenant (domain_*) do papel de plataforma.
    const allPermissions = await Permissao.query().whereNot('nome', 'like', 'domain_%')
    await givePermissionsToRole(
      'Platform_Admin',
      allPermissions.map((p) => p.nome)
    )

    // registrar como administradores de plataforma apenas os utilizadores criados por este
    // seeder — nunca todos os utilizadores existentes na base de dados (Users.all() promoveria
    // qualquer conta real já registada a Platform_Admin).
    const seededEmails = [
      'josebaptistatest99@example.com',
      'beneditociloca@gmail.com',
      'carlamorais@gmail.com',
    ]
    const users = await Users.query().whereIn('email', seededEmails)
    const permissions = await Papel.query().where("nome", 'like', "Platform_%")
    const permissionsMap = permissions.map(f => f.nome)

    for (const user of users) {
      await giveRoleToUser(user, permissionsMap)
    }

  }
}
