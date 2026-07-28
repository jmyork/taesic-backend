import AuthController from '#controllers/auth_controller'
import caixasController from '#controllers/caixa_controller'
import CatalogoPublicoController from '#controllers/catalogo_publico_controller'
import categorias_produtossController from '#controllers/categorias_produtos_controller'
import clientesController from '#controllers/cliente_controller'
import cobrancasController from '#controllers/cobranca_controller'
import cupomsController from '#controllers/cupom_controller'
import DomainUserPapelController from '#controllers/domain_user_papel_controller'
import empresasController from '#controllers/empresa_controller'
import estoquesController from '#controllers/estoque_controller'
import FacturaController from '#controllers/factura_controller'
import lotesController from '#controllers/lote_controller'
import marcasController from '#controllers/marca_controller'
import metodopagamentosController from '#controllers/metodopagamento_controller'
import MetricasController from '#controllers/metricas_controller'
import papelsController from '#controllers/papel_controller'
import papel_permissaosController from '#controllers/papel_permissao_controller'
import permissaosController from '#controllers/permissao_controller'
import pessoasController from '#controllers/pessoa_controller'
import planosController from '#controllers/plano_controller'
import possController from '#controllers/pos_controller'
import produto_categoriassController from '#controllers/produto_categorias_controller'
import produto_contraindicacoessController from '#controllers/produto_contraindicacoes_controller'
import produto_descricaosController from '#controllers/produto_descricao_controller'
import produto_fabricantessController from '#controllers/produto_fabricantes_controller'
import produto_formatossController from '#controllers/produto_formatos_controller'
import produto_fornecedoressController from '#controllers/produto_fornecedores_controller'
import produto_mediasController from '#controllers/produto_media_controller'
import produto_recomendacoessController from '#controllers/produto_recomendacoes_controller'
import produtossController from '#controllers/produtos_controller'
import produtos_reembolsosController from '#controllers/produtos_reembolso_controller'
import PromotorAuthController from '#controllers/promotor_auth_controller'
import PromotorController from '#controllers/promotor_controller'
import PromotorPainelController from '#controllers/promotor_painel_controller'
import subscricaosController from '#controllers/subscricao_controller'
import user_papelsController from '#controllers/user_papel_controller'
import userpossController from '#controllers/userpos_controller'
import venda_itenssController from '#controllers/venda_itens_controller'
import vendapagamentosController from '#controllers/vendapagamento_controller'
import vendassController from '#controllers/vendas_controller'
import VerificationTokenHashController from '#controllers/verification_token_hash_controller'

/**
 * Barrel central de todos os controllers usados nas rotas — permite referenciá-los
 * por tuplo (`[controllers.X, 'metodo']`) em vez de strings mágicas
 * (`'#controllers/x_controller.metodo'`), com verificação de tipos no nome do método
 * (TypeScript falha em tempo de compilação se o método não existir na classe).
 *
 * NOTA: ao contrário de `() => import(...)`, isto importa os 41 controllers
 * SEMPRE no arranque (carregamento eager) — decisão deliberada, aceite ao trocar
 * a convenção de rotas deste projecto.
 */
export const controllers = {
  Auth: AuthController,
  Caixa: caixasController,
  CatalogoPublico: CatalogoPublicoController,
  CategoriasProdutos: categorias_produtossController,
  Cliente: clientesController,
  Cobranca: cobrancasController,
  Cupom: cupomsController,
  DomainUserPapel: DomainUserPapelController,
  Empresa: empresasController,
  Estoque: estoquesController,
  Factura: FacturaController,
  Lote: lotesController,
  Marca: marcasController,
  MetodoPagamento: metodopagamentosController,
  Metricas: MetricasController,
  Papel: papelsController,
  PapelPermissao: papel_permissaosController,
  Permissao: permissaosController,
  Pessoa: pessoasController,
  Plano: planosController,
  Pos: possController,
  ProdutoCategorias: produto_categoriassController,
  ProdutoContraindicacoes: produto_contraindicacoessController,
  ProdutoDescricao: produto_descricaosController,
  ProdutoFabricantes: produto_fabricantessController,
  ProdutoFormatos: produto_formatossController,
  ProdutoFornecedores: produto_fornecedoressController,
  ProdutoMedia: produto_mediasController,
  ProdutoRecomendacoes: produto_recomendacoessController,
  Produtos: produtossController,
  ProdutosReembolso: produtos_reembolsosController,
  PromotorAuth: PromotorAuthController,
  Promotor: PromotorController,
  PromotorPainel: PromotorPainelController,
  Subscricao: subscricaosController,
  UserPapel: user_papelsController,
  UserPos: userpossController,
  VendaItens: venda_itenssController,
  VendaPagamento: vendapagamentosController,
  Vendas: vendassController,
  VerificationTokenHash: VerificationTokenHashController,
}
