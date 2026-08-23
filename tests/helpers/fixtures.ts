import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import User from '#models/user'
import Pos from '#models/faturacao/pos'
import Produtos from '#models/faturacao/produtos'
import Lote from '#models/faturacao/lote'
import Caixa from '#models/caixa'
import Vendas from '#models/faturacao/vendas'
import VendaItens from '#models/faturacao/venda_itens'
import MetodoPagamento from '#models/metodopagamento'
import Vendapagamento from '#models/vendapagamento'
import { giveRoleToUser } from '../../app/helpers/Utils.js'
import { clonarPapeisPadrao } from '../../app/helpers/papeis_da_empresa.js'

/**
 * Fábrica de fixtures usada pelos testes funcionais. Cria a árvore mínima de
 * entidades (empresa -> user -> pos -> produto -> lote -> caixa -> venda)
 * necessária para exercitar os repositórios reais contra a base de dados de
 * teste isolada (auth_system_test), dentro da transação global de cada teste.
 */

/**
 * Uma empresa de teste nasce com a SUA cópia dos papéis padrão, tal como uma
 * empresa real.
 *
 * Não é conveniência: desde que os papéis passaram a pertencer a uma empresa
 * (migração `alter_papel_por_empresa`), uma empresa sem papéis é uma empresa que
 * não pode existir em produção — `giveRoleToUser` não encontraria "Admin" no
 * âmbito dela, e ninguém conseguiria entrar. Uma fixture que produzisse esse
 * estado deixaria testes a passar sobre uma realidade que o registo real nunca
 * cria, que é a pior espécie de fixture.
 *
 * `comPapeis: false` existe para os poucos testes que querem precisamente uma
 * empresa nua (ex.: provar que o registo falha sem papéis semeados).
 */
export async function createEmpresa(
  overrides: Partial<{ company_alias: string; nome: string; comPapeis: boolean }> = {}
) {
  const suffix = randomUUID().slice(0, 8)
  const empresa = await Empresa.create({
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

  if (overrides.comPapeis !== false) {
    await clonarPapeisPadrao(empresa.id)
  }

  return empresa
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

export async function createProduto(
  empresa: Empresa,
  overrides: Partial<{ nome: string; is_service: boolean; disponivel: boolean }> = {}
) {
  const suffix = randomUUID().slice(0, 8)
  // produtos.numero é notNullable + unique(empresa_id, numero) — este fixture não
  // precisa do lock aplicativo de produtos_repository.create() (testes correm
  // sequencialmente dentro da mesma transacção global), só de nunca reutilizar um
  // número já usado por esta empresa.
  const ultimo = await Produtos.query().where('empresa_id', empresa.id).orderBy('numero', 'desc').first()
  return Produtos.create({
    nome: overrides.nome ?? `Produto ${suffix}`,
    descricao: 'Produto de teste',
    is_service: overrides.is_service ?? false,
    disponivel: overrides.disponivel ?? true,
    empresa_id: empresa.id,
    numero: (ultimo?.numero ?? 0) + 1,
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
    // A coluna só aceita 'Aberto'/'Fechado' (enum da BD e tipo do model). Os testes
    // escrevem-no em minúsculas em vários sítios — normaliza-se aqui, num só lugar.
    status: (overrides.status ?? 'Aberto').toLowerCase() === 'fechado' ? 'Fechado' : 'Aberto',
    observacoes: '',
    total_caixa: 0,
  })
}

export async function createVenda(
  caixa: Caixa,
  overrides: Partial<{ status: 'aberta' | 'fechada' | 'cancelada' | 'reembolsada' | 'proforma'; total: number }> = {}
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

/** `metodopagamento` é isolado por empresa (tenant) — precisa sempre de uma `Empresa`. */
export async function createMetodoPagamento(empresa: Empresa, overrides: Partial<{ nome: string }> = {}) {
  const suffix = randomUUID().slice(0, 8)
  return MetodoPagamento.create({
    nome: overrides.nome ?? `Numerário ${suffix}`,
    descricao: 'Método de pagamento de teste',
    empresa_id: empresa.id,
  })
}

/**
 * `vendas_repository.close()` exige pelo menos um pagamento registado cujo total bata
 * certo com o total da venda (já com desconto de cupão aplicado, se houver) — sem isto,
 * `close()` rejeita com `VendaSemPagamentoException`/`VendaPagamentoIncompletoException`.
 * Cria um `MetodoPagamento` novo (na empresa dona da caixa da venda, via
 * venda->caixa->pos->empresa) e um único pagamento no valor exacto indicado — assinatura
 * inalterada de propósito, para não obrigar a tocar em todos os call-sites existentes.
 */
export async function pagarVenda(venda: Vendas, valor: number) {
  const caixa = await Caixa.findOrFail(venda.caixa_id!)
  const pos = await Pos.findOrFail(caixa.pos_id)
  const empresa = await Empresa.findOrFail(pos.empresa_id)
  const metodo = await createMetodoPagamento(empresa)
  return Vendapagamento.create({
    venda_id: venda.id,
    metodo_pagamento_id: metodo.id,
    valor,
  })
}
