import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import User from '#models/user'
import Pos from '#models/faturacao/pos'
import Produtos from '#models/faturacao/produtos'
import Lote from '#models/faturacao/lote'
import Caixa from '#models/caixa'
import Vendas from '#models/faturacao/vendas'
import VendaItens from '#models/faturacao/venda_itens'
import { giveRoleToUser } from '../../app/helpers/Utils.js'

/**
 * Fábrica de fixtures usada pelos testes funcionais. Cria a árvore mínima de
 * entidades (empresa -> user -> pos -> produto -> lote -> caixa -> venda)
 * necessária para exercitar os repositórios reais contra a base de dados de
 * teste isolada (auth_system_test), dentro da transação global de cada teste.
 */

export async function createEmpresa(overrides: Partial<{ company_alias: string; nome: string }> = {}) {
  const suffix = randomUUID().slice(0, 8)
  return Empresa.create({
    nome: overrides.nome ?? `Empresa Teste ${suffix}`,
    nif: `NIF${suffix}`,
    tamanho: 'pequena',
    status: true,
    inadiplente: false,
    regime_iva: false,
    company_alias: overrides.company_alias ?? `empresa-teste-${suffix}`,
    localizacao: 'Luanda',
    contacto: '900000000',
    verified: true,
    user_id: '',
  } as any)
}

export async function createUser(empresa: Empresa, roles: string[] = []) {
  const suffix = randomUUID().slice(0, 8)
  const user = await User.create({
    username: `user-${suffix}`,
    email: `user-${suffix}@example.com`,
    password: 'Password123!#',
    empresa_id: empresa.id,
  })
  if (roles.length > 0) {
    await giveRoleToUser(user, roles)
  }
  return user
}

export async function createPos(empresa: Empresa, overrides: Partial<{ nome: string }> = {}) {
  const suffix = randomUUID().slice(0, 8)
  return Pos.create({
    nome: overrides.nome ?? `POS ${suffix}`,
    localizacao: 'Luanda',
    contacto: '900000000',
    email: `pos-${suffix}@example.com`,
    empresa_id: empresa.id,
  })
}

export async function createProduto(empresa: Empresa, overrides: Partial<{ nome: string; is_service: boolean }> = {}) {
  const suffix = randomUUID().slice(0, 8)
  return Produtos.create({
    nome: overrides.nome ?? `Produto ${suffix}`,
    descricao: 'Produto de teste',
    is_service: overrides.is_service ?? false,
    empresa_id: empresa.id,
  })
}

export async function createLote(
  produto: Produtos,
  overrides: Partial<{ quantidade_em_estoque: number; preco_venda: number; preco_compra: number }> = {}
) {
  return Lote.create({
    produto_id: produto.id,
    data_validade: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) as any,
    data_fabrico: new Date() as any,
    quantidade_em_estoque: overrides.quantidade_em_estoque ?? 100,
    preco_venda: overrides.preco_venda ?? 1000,
    preco_compra: overrides.preco_compra ?? 500,
  })
}

export async function createCaixa(
  user: User,
  pos: Pos,
  overrides: Partial<{ status: string; valor_inicial: number }> = {}
) {
  return Caixa.create({
    user_id: user.id,
    pos_id: pos.id,
    valor_inicial: overrides.valor_inicial ?? 0,
    total_vendas: 0,
    status: overrides.status ?? 'aberto',
    observacoes: '',
    total_caixa: 0,
  })
}

export async function createVenda(
  caixa: Caixa,
  overrides: Partial<{ status: 'aberta' | 'fechada' | 'cancelada' | 'reembolsada'; total: number }> = {}
) {
  return Vendas.create({
    caixa_id: caixa.id,
    total: overrides.total ?? 0,
    status: overrides.status ?? 'aberta',
    venda_tipo: 'presencial',
  })
}

export async function createVendaItem(
  venda: Vendas,
  lote: Lote,
  overrides: Partial<{ quantidade: number; preco_unitario: number }> = {}
) {
  const quantidade = overrides.quantidade ?? 1
  const preco_unitario = overrides.preco_unitario ?? lote.preco_venda
  return VendaItens.create({
    venda_id: venda.id,
    lote_produto_id: lote.id,
    quantidade,
    preco_unitario,
    total: quantidade * preco_unitario,
    quantidade_reembolsada: 0,
  })
}

/** Cria uma árvore completa e mínima: empresa -> user (com papéis) -> pos, pronta para os testes. */
export async function createTenant(roles: string[] = ['Admin']) {
  const empresa = await createEmpresa()
  const user = await createUser(empresa, roles)
  const pos = await createPos(empresa)
  return { empresa, user, pos }
}
