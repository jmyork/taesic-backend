import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'

router
    .group(() => {
        router
            .resource('produto-marcas', () => import('#controllers/marca_controller'))
            .apiOnly()
            .as('domain_produto_marcas') //(v)

        router
            .resource('produto-formatos', () => import('#controllers/produto_formatos_controller'))
            .apiOnly()
            .as('domain_produto_formatos') //(v)

        router
            .resource('produto-categorias', () => import('#controllers/produto_categorias_controller'))
            .apiOnly()
            .as('domain_produto_categorias') //(v)

        router
            .resource('produto-fabricantes', () => import('#controllers/produto_fabricantes_controller'))
            .apiOnly()
            .as('domain_produto_fabricantes') //(v)

        router
            .resource(
                'produto-fornecedores',
                () => import('#controllers/produto_fornecedores_controller')
            )
            .apiOnly()
            .as('domain_produto_fornecedores') //(v)

        router
            .resource('produtos', () => import('#controllers/produtos_controller'))
            .apiOnly()
            .as('domain_produtos') //(v)

        router
            .resource('produto-descricoes', () => import('#controllers/produto_descricao_controller'))
            .apiOnly()
            .as('domain_produto_descricoes') //(v)

        router
            .resource('produto-medias', () => import('#controllers/produto_media_controller'))
            .apiOnly()
            .except(['update'])
            .as('domain_produto_media') //(v)

        router
            .resource('produto-categoria-categorias', () => import('#controllers/categorias_produtos_controller'))
            .apiOnly()
            .except(['update'])
            .as('domain_categorias_produtos') //(v)

        router
            .resource(
                'produto-contraindicacoes',
                () => import('#controllers/produto_contraindicacoes_controller')
            )
            .apiOnly()
            .as('domain_produto_contraindicacoes') //(v)

        router
            .resource(
                'produto-recomendacoes',
                () => import('#controllers/produto_recomendacoes_controller')
            )
            .apiOnly()
            .as('domain_produto_recomendacoes') //(v)

        router
            .resource('pos', () => import('#controllers/pos_controller'))
            .apiOnly()
            .as('domain_pos') //(v)

        // facturação
        // router.resource('empresa', () => import('#controllers/empresa_controller')).apiOnly()
        router
            .resource('lote-produtos', () => import('#controllers/lote_controller'))
            .apiOnly()
            .as('domain_lote_produto') //(v)

        router
            .resource('estoque', () => import('#controllers/estoque_controller'))
            .apiOnly()
            .except(['destroy', 'update', 'destroy'])
            .as('domain_estoque') //(v)

        router
            .resource('user-pos', () => import('#controllers/userpos_controller'))
            .apiOnly()
            .except(['update'])
            .as('domain_user_pos') //(v)

        router.resource("caixas", () => import('#controllers/caixa_controller')).apiOnly().except(["update"]).as('domain_caixas') //(v)

        router.get('caixas/meu', '#controllers/caixa_controller.myCaixas').as('domain_caixa.my')


        // ---------------------- vendas start----------------------
        router
            .resource('vendas', () => import('#controllers/vendas_controller'))
            .apiOnly()
            .except(['destroy', 'update'])
            .as('domain_vendas')//(v)

        router.post("vendas/fechar/:id", '#controllers/vendas_controller.close').as('domain_vendas.destroy')//(v)

        router.post("vendas/anular/:id", '#controllers/vendas_controller.cancel').as('domain_vendas.anular')


        router
            .resource('venda-itens', () => import('#controllers/venda_itens_controller'))
            .apiOnly()
            .except(['update'])
            .as('domain_vendas_itens')//(V)


        router.post("reembolsar-total", '#controllers/produtos_reembolso_controller.reembolsar_total').as('domain_reembolso_total')

        router.post("reembolsar-parcial", '#controllers/produtos_reembolso_controller.reembolsar_parcial').as('domain_reembolso_parcial')

        router.get("consultar-reembolso", '#controllers/produtos_reembolso_controller.index').as('domain_reembolso_consultar')
        router.get("consultar-reembolso/:venda_id", '#controllers/produtos_reembolso_controller.show').as('domain_reembolso_consultar_id')

        router.resource('cupom', () => import('#controllers/cupom_controller')).apiOnly().as('domain_cupom')

        // Gestão dos promotores desta empresa (domain) — inclui promotores só desta empresa
        // e, no `store`/`index`, a possibilidade de a empresa consultar/ativar cupões para
        // promotores de plataforma já existentes (ver promotor_controller.ts).
        router.resource('promotores', () => import('#controllers/promotor_controller')).apiOnly().as('domain_promotores')

        // ---------------------vendas end-------------------------------
        router.resource('cliente', () => import('#controllers/cliente_controller'))
            .as("domain_cliente")
            .apiOnly()

        router.resource('pessoa', () => import('#controllers/pessoa_controller'))
            .as('domain_pessoa')
            .apiOnly()

        router.resource('vendapagamento', () => import('#controllers/vendapagamento_controller'))
            .as('domain_vendapagamento')
            .apiOnly()

        router.resource('subscricao', () => import('#controllers/subscricao_controller'))
            .as('domain_subscricao')
            .apiOnly()

        router.resource('cobranca', () => import('#controllers/cobranca_controller'))
            .as('domain_cobranca')
            .apiOnly()

        // Gestão de papéis dos utilizadores da própria empresa (nunca papéis de plataforma,
        // ver domain_user_papel_repository.ts). As permissões domain_user_papel.* já estavam
        // seedadas e atribuídas a Admin/AdminUserManager/AdminUserVisualizador, mas nenhuma
        // rota usava este nome — ficavam órfãs até esta rota existir.
        router.resource('user-papeis', () => import('#controllers/domain_user_papel_controller'))
            .apiOnly()
            .except(['show', 'update'])
            .as('domain_user_papel')

        router.get('papeis-disponiveis', '#controllers/domain_user_papel_controller.papeisDisponiveis')
            .as('domain_user_papel.papeis_disponiveis')

        // Métricas/controlo: dashboard, desempenho por posto e por vendedor. Não existia
        // nenhum endpoint de agregação/relatório na API antes destes três.
        router.get('metricas/resumo', '#controllers/metricas_controller.resumo').as('domain_metricas.resumo')
        router.get('metricas/postos', '#controllers/metricas_controller.postos').as('domain_metricas.postos')
        router.get('metricas/vendedores', '#controllers/metricas_controller.vendedores').as('domain_metricas.vendedores')
        router.get('metricas/por-dia', '#controllers/metricas_controller.porDia').as('domain_metricas.por_dia')
        // Impacto agregado dos promotores NESTA empresa (o inverso do painel do promotor, que
        // mostra o desempenho de UM promotor em todas as lojas onde tem cupão).
        router.get('metricas/promotores/resumo', '#controllers/metricas_controller.promotoresResumo').as('domain_metricas.promotores_resumo')
        router.get('metricas/promotores/por-promotor', '#controllers/metricas_controller.promotoresPorPromotor').as('domain_metricas.promotores_por_promotor')
        router.get('metricas/promotores/por-produto', '#controllers/metricas_controller.promotoresPorProduto').as('domain_metricas.promotores_por_produto')

        // Facturas: emissão a partir de uma venda fechada, numeração sequencial por empresa.
        // Não existia nenhuma funcionalidade de facturação na API antes desta.
        router.resource('facturas', () => import('#controllers/factura_controller'))
            .apiOnly()
            .except(['update', 'destroy'])
            .as('domain_facturas')

        router.post('facturas/anular/:id', '#controllers/factura_controller.anular').as('domain_facturas.anular')

        // auth
        router.post('auth/register', '#controllers/auth_controller.register').as('domain_auth.register') //(v)
        router.get('auth/list', '#controllers/auth_controller.index').as('domain_auth.list') //(v)
        router.get('auth/show/:user_id', '#controllers/auth_controller.show')
            .where('user_id', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) //(v)
            .as('domain_auth.show') //(v)

        router.get('auth/me', '#controllers/auth_controller.details').as('domain_auth.me') //(v)

        // TODO: endpoint planeado para fechar a venda num único passo (itens + pagamento),
        // mas 'create_venda_with_items' nunca foi implementado em vendas_controller.ts.
        // Desativado para não expor uma rota que sempre falha em runtime — ver proposta
        // de fluxo transacional único no plano de reorganização do PDV.
        // router.post('criar-venda-com-todos-detalhes', '#controllers/vendas_controller.create_venda_with_items')
        //     .as('domain_vendas.create_completo')
    })
    .prefix('api/:company_alias')
    .where('company_alias', /^(?!.*--)[a-z]+(?:-[a-z]+)*$/)
    .use(middleware.auth({ guards: ['api'] }))
    .use(middleware.ValidateCompanyAliasMiddleware())
    .use(middleware.permission())

router
    .post('auth/reset-password/:token', '#controllers/auth_controller.reset_password')
    .prefix('api/:company_alias')
    .where('company_alias', /^(?!.*--)[a-z]+(?:-[a-z]+)*$/) //(v)
    .as('domain_reset.password')
router
    .post('auth/forgot-password', '#controllers/auth_controller.forgot_password')
    .prefix('api/:company_alias')
    .where('company_alias', /^(?!.*--)[a-z]+(?:-[a-z]+)*$/) //(v)
    .as('domain_forgot.password')
