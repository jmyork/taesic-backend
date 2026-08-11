import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'
import { emailActionThrottle } from '#start/limiter'
import { controllers } from '#generated/controllers'

router
    .group(() => {
        router
            .resource('produto-marcas', controllers.Marca)
            .apiOnly()
            .as('domain_produto_marcas') //(v)

        router
            .resource('produto-formatos', controllers.ProdutoFormatos)
            .apiOnly()
            .as('domain_produto_formatos') //(v)

        router
            .resource('produto-categorias', controllers.ProdutoCategorias)
            .apiOnly()
            .as('domain_produto_categorias') //(v)

        router
            .resource('produto-fabricantes', controllers.ProdutoFabricantes)
            .apiOnly()
            .as('domain_produto_fabricantes') //(v)

        router
            .resource('produto-fornecedores', controllers.ProdutoFornecedores)
            .apiOnly()
            .as('domain_produto_fornecedores') //(v)

        // Tem de ser registada antes de `.resource('produtos', ...)` — caso contrário a rota
        // genérica `GET produtos/:id` do resource intercepta `produtos/catalogo` (mesmo
        // problema já documentado para `caixas/meu` acima).
        router
            .get('produtos/catalogo', [controllers.Produtos, 'catalogo'])
            .as('domain_produtos.catalogo')

        // Mesmo motivo — antes de `.resource('produtos', ...)`, senão `GET produtos/:id`
        // intercepta `produtos/alertas`.
        router
            .get('produtos/alertas', [controllers.Produtos, 'alertas'])
            .as('domain_produtos.alertas')

        router
            .resource('produtos', controllers.Produtos)
            .apiOnly()
            .as('domain_produtos') //(v)

        router
            .post('produtos/registrar-com-detalhes', [controllers.Produtos, 'registrar_produto_and_detalhes'])
            .as('domain_produtos.registrar_com_detalhes')

        router
            .resource('produto-descricoes', controllers.ProdutoDescricao)
            .apiOnly()
            .as('domain_produto_descricoes') //(v)

        router
            .resource('produto-medias', controllers.ProdutoMedia)
            .apiOnly()
            .except(['update'])
            .as('domain_produto_media') //(v)

        router
            .resource('produto-categoria-categorias', controllers.CategoriasProdutos)
            .apiOnly()
            .except(['update'])
            .as('domain_categorias_produtos') //(v)

        router
            .resource('produto-contraindicacoes', controllers.ProdutoContraindicacoes)
            .apiOnly()
            .as('domain_produto_contraindicacoes') //(v)

        router
            .resource('produto-recomendacoes', controllers.ProdutoRecomendacoes)
            .apiOnly()
            .as('domain_produto_recomendacoes') //(v)

        // Tem de ser registada antes de `.resource('pos', ...)` — caso contrário a rota
        // genérica `GET pos/:id` do resource intercepta `pos/meu` (mesmo problema já
        // documentado para `caixas/meu` e `produtos/catalogo` acima).
        router.get('pos/meu', [controllers.Pos, 'meusPos']).as('domain_pos.meu')

        router
            .resource('pos', controllers.Pos)
            .apiOnly()
            .as('domain_pos') //(v)

        router
            .resource('lote-produtos', controllers.Lote)
            .apiOnly()
            .as('domain_lote_produto') //(v)

        router
            .resource('estoque', controllers.Estoque)
            .apiOnly()
            .except(['destroy', 'update', 'destroy'])
            .as('domain_estoque') //(v)

        router
            .resource('user-pos', controllers.UserPos)
            .apiOnly()
            .except(['update'])
            .as('domain_user_pos') //(v)

        // Tem de ser registada antes de `.resource('caixas', ...)` — caso contrário a rota
        // genérica `GET caixas/:id` do resource intercepta `caixas/meu` (tratando "meu" como
        // um id) antes de esta rota ser sequer considerada, e o pedido rebenta com um 404
        // "Row not found" em vez de chamar `myCaixas`.
        router.get('caixas/meu', [controllers.Caixa, 'myCaixas']).as('domain_caixa.my')

        router.resource("caixas", controllers.Caixa).apiOnly().except(["update"]).as('domain_caixas') //(v)


        // ---------------------- vendas start----------------------
        router
            .resource('vendas', controllers.Vendas)
            .apiOnly()
            .except(['destroy', 'update'])
            .as('domain_vendas')//(v)

        router.post("vendas/fechar/:id", [controllers.Vendas, 'close']).as('domain_vendas.destroy')//(v)

        router.post("vendas/anular/:id", [controllers.Vendas, 'cancel']).as('domain_vendas.anular')


        router
            .resource('venda-itens', controllers.VendaItens)
            .apiOnly()
            .except(['update'])
            .as('domain_vendas_itens')//(V)


        router.post("reembolsar-total", [controllers.ProdutosReembolso, 'reembolsar_total']).as('domain_reembolso_total')

        router.post("reembolsar-parcial", [controllers.ProdutosReembolso, 'reembolsar_parcial']).as('domain_reembolso_parcial')

        router.get("consultar-reembolso", [controllers.ProdutosReembolso, 'index']).as('domain_reembolso_consultar')
        router.get("consultar-reembolso/:venda_id", [controllers.ProdutosReembolso, 'show']).as('domain_reembolso_consultar_id')

        router.resource('cupom', controllers.Cupom).apiOnly().as('domain_cupom')

        // Gestão dos promotores desta empresa (domain) — inclui promotores só desta empresa
        // e, no `store`/`index`, a possibilidade de a empresa consultar/ativar cupões para
        // promotores de plataforma já existentes (ver promotor_controller.ts).
        router.resource('promotores', controllers.Promotor).apiOnly().as('domain_promotores')

        // ---------------------vendas end-------------------------------
        router.resource('cliente', controllers.Cliente)
            .as("domain_cliente")
            .apiOnly()

        router.resource('pessoa', controllers.Pessoa)
            .as('domain_pessoa')
            .apiOnly()

        router.resource('venda-pagamento', controllers.VendaPagamento)
            .as('domain_vendapagamento')
            .apiOnly()

        // Métodos de pagamento — isolados por empresa (deixaram de ser um recurso de
        // plataforma partilhado por todos os tenants). Só Admin cria/edita/apaga
        // (domain_metodo_pagamento.store/update/destroy); index/show também é dado a
        // Gerente/Supervisor/Vendedor/Estoquista, que precisam de listar os métodos
        // disponíveis para registar um vendapagamento.
        router.resource('metodo-pagamento', controllers.MetodoPagamento)
            .as('domain_metodo_pagamento')
            .apiOnly()

        router.resource('subscricao', controllers.Subscricao)
            .as('domain_subscricao')
            .apiOnly()

        router.resource('cobranca', controllers.Cobranca)
            .as('domain_cobranca')
            .apiOnly()

        // Gestão de papéis dos utilizadores da própria empresa (nunca papéis de plataforma,
        // ver domain_user_papel_repository.ts). As permissões domain_user_papel.* já estavam
        // seedadas e atribuídas a Admin/AdminUserManager/AdminUserVisualizador, mas nenhuma
        // rota usava este nome — ficavam órfãs até esta rota existir.
        router.resource('user-papeis', controllers.DomainUserPapel)
            .apiOnly()
            .except(['show', 'update'])
            .as('domain_user_papel')

        router.get('papeis-disponiveis', [controllers.DomainUserPapel, 'papeisDisponiveis'])
            .as('domain_user_papel.papeis_disponiveis')

        // Métricas/controlo: dashboard, desempenho por posto e por vendedor. Não existia
        // nenhum endpoint de agregação/relatório na API antes destes três.
        router.get('metricas/resumo', [controllers.Metricas, 'resumo']).as('domain_metricas.resumo')
        router.get('metricas/postos', [controllers.Metricas, 'postos']).as('domain_metricas.postos')
        router.get('metricas/vendedores', [controllers.Metricas, 'vendedores']).as('domain_metricas.vendedores')
        router.get('metricas/por-dia', [controllers.Metricas, 'porDia']).as('domain_metricas.por_dia')
        // Impacto agregado dos promotores NESTA empresa (o inverso do painel do promotor, que
        // mostra o desempenho de UM promotor em todas as lojas onde tem cupão).
        router.get('metricas/promotores/resumo', [controllers.Metricas, 'promotoresResumo']).as('domain_metricas.promotores_resumo')
        router.get('metricas/promotores/por-promotor', [controllers.Metricas, 'promotoresPorPromotor']).as('domain_metricas.promotores_por_promotor')
        router.get('metricas/promotores/por-produto', [controllers.Metricas, 'promotoresPorProduto']).as('domain_metricas.promotores_por_produto')

        // Despesas — registo manual de gastos da empresa (renda, salários, serviços, etc.),
        // usado pelo Relatório de Despesas e pelo Fluxo de Caixa.
        router.resource('despesas', controllers.Despesas)
            .apiOnly()
            .as('domain_despesas')

        // Relatórios — dashboard executivo, evolução de vendas, tops e os relatórios
        // detalhados pedidos (vendas, clientes, método de pagamento, produtos, stock,
        // compras, lucro, impostos, utilizadores, descontos, documentos anulados, notas de
        // crédito, rentabilidade, comparativos, fluxo de caixa). Só leitura — nenhuma destas
        // rotas cria/edita/apaga nada, por isso todas são GET.
        router.get('relatorios/dashboard-executivo', [controllers.Relatorios, 'dashboardExecutivo']).as('domain_relatorios.dashboard_executivo')
        router.get('relatorios/kpis-gerais', [controllers.Relatorios, 'kpisGerais']).as('domain_relatorios.kpis_gerais')
        router.get('relatorios/faturacao-por-periodo', [controllers.Relatorios, 'faturacaoPorPeriodo']).as('domain_relatorios.faturacao_por_periodo')
        router.get('relatorios/evolucao-vendas', [controllers.Relatorios, 'evolucaoVendas']).as('domain_relatorios.evolucao_vendas')
        router.get('relatorios/top-produtos', [controllers.Relatorios, 'topProdutos']).as('domain_relatorios.top_produtos')
        router.get('relatorios/top-categorias', [controllers.Relatorios, 'topCategorias']).as('domain_relatorios.top_categorias')
        router.get('relatorios/top-clientes', [controllers.Relatorios, 'topClientes']).as('domain_relatorios.top_clientes')
        router.get('relatorios/top-vendedores', [controllers.Relatorios, 'topVendedores']).as('domain_relatorios.top_vendedores')
        router.get('relatorios/vendas', [controllers.Relatorios, 'relatorioVendas']).as('domain_relatorios.vendas')
        router.get('relatorios/clientes', [controllers.Relatorios, 'relatorioClientes']).as('domain_relatorios.clientes')
        router.get('relatorios/metodo-pagamento', [controllers.Relatorios, 'relatorioMetodoPagamento']).as('domain_relatorios.metodo_pagamento')
        router.get('relatorios/produtos', [controllers.Relatorios, 'relatorioProdutos']).as('domain_relatorios.produtos')
        router.get('relatorios/stock', [controllers.Relatorios, 'relatorioStock']).as('domain_relatorios.stock')
        router.get('relatorios/compras', [controllers.Relatorios, 'relatorioCompras']).as('domain_relatorios.compras')
        router.get('relatorios/lucro', [controllers.Relatorios, 'relatorioLucro']).as('domain_relatorios.lucro')
        router.get('relatorios/impostos', [controllers.Relatorios, 'relatorioImpostos']).as('domain_relatorios.impostos')
        router.get('relatorios/utilizadores', [controllers.Relatorios, 'relatorioUtilizadores']).as('domain_relatorios.utilizadores')
        router.get('relatorios/descontos', [controllers.Relatorios, 'relatorioDescontos']).as('domain_relatorios.descontos')
        router.get('relatorios/documentos-anulados', [controllers.Relatorios, 'relatorioDocumentosAnulados']).as('domain_relatorios.documentos_anulados')
        router.get('relatorios/notas-credito', [controllers.Relatorios, 'relatorioNotasCredito']).as('domain_relatorios.notas_credito')
        router.get('relatorios/rentabilidade', [controllers.Relatorios, 'relatorioRentabilidade']).as('domain_relatorios.rentabilidade')
        router.get('relatorios/comparativo', [controllers.Relatorios, 'comparativo']).as('domain_relatorios.comparativo')
        router.get('relatorios/fluxo-caixa', [controllers.Relatorios, 'fluxoCaixa']).as('domain_relatorios.fluxo_caixa')

        // Facturas: emissão a partir de uma venda fechada, numeração sequencial por empresa.
        // Não existia nenhuma funcionalidade de facturação na API antes desta.
        router.resource('facturas', controllers.Factura)
            .apiOnly()
            .except(['update', 'destroy'])
            .as('domain_facturas')

        router.post('facturas/anular/:id', [controllers.Factura, 'anular']).as('domain_facturas.anular')

        // auth
        router.post('auth/register', [controllers.Auth, 'register']).as('domain_auth.register') //(v)
        router.get('auth/list', [controllers.Auth, 'index']).as('domain_auth.list') //(v)
        router.get('auth/show/:user_id', [controllers.Auth, 'show'])
            .where('user_id', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) //(v)
            .as('domain_auth.show') //(v)

        router.get('auth/me', [controllers.Auth, 'details']).as('domain_auth.me') //(v)
    })
    .prefix('api/:company_alias')
    .where('company_alias', /^(?!.*--)[a-z]+(?:-[a-z]+)*$/)
    .use(middleware.auth({ guards: ['api'] }))
    .use(middleware.ValidateCompanyAliasMiddleware())
    .use(middleware.permission())

router
    .post('auth/reset-password/:token', [controllers.Auth, 'reset_password'])
    .prefix('api/:company_alias')
    .where('company_alias', /^(?!.*--)[a-z]+(?:-[a-z]+)*$/) //(v)
    .use(emailActionThrottle)
    .as('domain_reset.password')
router
    .post('auth/forgot-password', [controllers.Auth, 'forgot_password'])
    .prefix('api/:company_alias')
    .where('company_alias', /^(?!.*--)[a-z]+(?:-[a-z]+)*$/) //(v)
    .use(emailActionThrottle)
    .as('domain_forgot.password')
