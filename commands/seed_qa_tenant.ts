import { BaseCommand } from '@adonisjs/core/ace'
import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import User from '#models/user'
import UserPapel from '#models/auth/user_papel'
import Papel from '#models/auth/papel'
import VerificationTokenHash from '#models/verification_token_hash'
import Pos from '#models/faturacao/pos'
import Caixa from '#models/caixa'
import Produtos from '#models/faturacao/produtos'
import Lote from '#models/faturacao/lote'
import Vendas from '#models/faturacao/vendas'
import VendaItens from '#models/faturacao/venda_itens'
import Cliente from '#models/cliente'
import { giveRoleToUser } from '../app/helpers/Utils.js'
import { semearMetodosPagamento } from '../app/helpers/metodos_pagamento_padrao.js'

const COMPANY_ALIAS = 'qa-audit'
const UID = 'qa.audit@example.com'
const PASSWORD = 'QaAudit123!#'

export default class SeedQaTenant extends BaseCommand {
  static commandName = 'seed:qa-tenant'
  static description = 'Cria (de forma idempotente) uma empresa e um utilizador Admin dedicados a testes automatizados de UI (Playwright)'
  static options = { startApp: true }

  async run() {
    let empresa = await Empresa.findBy('company_alias', COMPANY_ALIAS)
    if (!empresa) {
      empresa = await Empresa.create({
        nome: 'QA Audit Empresa',
        nif: '5000000000',
        tamanho: 'pequena',
        status: true,
        inadiplente: false,
        regime_iva: false,
        company_alias: COMPANY_ALIAS,
        localizacao: 'Luanda',
        contacto: '900000000',
        verified: true,
      } as any)
      this.logger.success(`Empresa criada: ${COMPANY_ALIAS}`)
    } else {
      this.logger.info(`Empresa já existe: ${COMPANY_ALIAS}`)
    }

    let user = await User.findBy('email', UID)
    if (!user) {
      user = await User.create({
        username: 'qa.audit',
        email: UID,
        password: PASSWORD,
        empresa_id: empresa.id,
      })
      this.logger.success(`Utilizador criado: ${UID}`)
    } else {
      this.logger.info(`Utilizador já existe: ${UID}`)
    }

    const existingToken = await VerificationTokenHash.query()
      .where('user_id', user.id)
      .where('purpose', 'account_activation')
      .first()

    if (!existingToken) {
      await VerificationTokenHash.create({
        user_id: user.id,
        empresa_id: empresa.id,
        purpose: 'account_activation',
        verification_token_public: randomUUID(),
        verification_token_hash: randomUUID(),
        verified: true,
      })
      this.logger.success('Verification token criado (conta ativada)')
    }

    const adminPapel = await Papel.findByOrFail('nome', 'Admin')
    const hasAdminRole = await UserPapel.query()
      .where('user_id', user.id)
      .where('papel_id', adminPapel.id)
      .first()
    if (!hasAdminRole) {
      await giveRoleToUser(user, 'Admin')
      this.logger.success('Papel Admin atribuído')
    } else {
      this.logger.info('Papel Admin já atribuído')
    }

    await this.semearDadosOperacionais(empresa, user)

    this.logger.success('Pronto. Credenciais de login para testes automatizados:')
    console.log({ company_alias: COMPANY_ALIAS, uid: UID, password: PASSWORD })
  }

  /**
   * Dados mínimos para a empresa ser NAVEGÁVEL, e não apenas autenticável.
   *
   * Antes isto criava só empresa + utilizador + papel. O resultado é que qualquer teste de
   * browser abria um sistema completamente vazio: sem posto, sem caixa, sem produtos e sem
   * documentos — logo, ecrãs que só conseguem provar "não rebentou", nunca "funciona". Para
   * verificar coisas como a impressão de uma proforma é preciso existir uma proforma.
   *
   * A alternativa era testar contra a empresa real do utilizador, o que significaria criar-lhe
   * lixo na base de dados. Isto evita-o.
   *
   * Tudo é idempotente: procura antes de criar, para poder correr as vezes que forem precisas.
   */
  private async semearDadosOperacionais(empresa: Empresa, user: User) {
    await semearMetodosPagamento(empresa.id)

    let pos = await Pos.query().where('empresa_id', empresa.id).whereNull('deleted_at').first()
    if (!pos) {
      pos = await Pos.create({
        nome: 'Posto QA',
        localizacao: 'Luanda',
        contacto: '900000000',
        email: 'posto.qa@example.com',
        empresa_id: empresa.id,
      })
      this.logger.success('Posto de venda criado')
    }

    // O valor canónico da coluna é 'Aberto' com maiúscula (o tipo do modelo é
    // 'Aberto' | 'Fechado'). Em minúsculas passava por acaso, graças à collation
    // insensível do MySQL, mas o TypeScript apanha-o — e um deploy com collation
    // sensível a maiúsculas deixaria de encontrar a caixa.
    let caixa = await Caixa.query()
      .where('pos_id', pos.id)
      .where('status', 'Aberto')
      .whereNull('deleted_at')
      .first()
    if (!caixa) {
      caixa = await Caixa.create({
        user_id: user.id,
        pos_id: pos.id,
        valor_inicial: 0,
        total_vendas: 0,
        total_caixa: 0,
        status: 'Aberto',
        observacoes: 'Caixa de testes automatizados',
      })
      this.logger.success('Caixa aberta criada')
    }

    // Dois produtos com lote e stock, para o catálogo e o PDV terem o que mostrar.
    const lotes: Lote[] = []
    for (const [indice, nome] of ['Produto QA A', 'Produto QA B'].entries()) {
      let produto = await Produtos.query()
        .where('empresa_id', empresa.id)
        .where('nome', nome)
        .whereNull('deleted_at')
        .first()
      if (!produto) {
        const ultimo = await Produtos.query()
          .where('empresa_id', empresa.id)
          .orderBy('numero', 'desc')
          .first()
        produto = await Produtos.create({
          nome,
          descricao: 'Produto para testes automatizados',
          is_service: false,
          disponivel: true,
          empresa_id: empresa.id,
          numero: (ultimo?.numero ?? 0) + 1,
        })
      }

      let lote = await Lote.query().where('produto_id', produto.id).whereNull('deleted_at').first()
      if (!lote) {
        lote = await Lote.create({
          produto_id: produto.id,
          data_validade: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) as any,
          data_fabrico: new Date() as any,
          quantidade_em_estoque: 100,
          // Preços deliberadamente NÃO redondos: 1250,50 e 899,99 obrigam o cálculo do IVA e do
          // troco a lidar com cêntimos. Com preços redondos, erros de arredondamento passam
          // despercebidos em todos os testes.
          preco_venda: indice === 0 ? 1250.5 : 899.99,
          preco_compra: indice === 0 ? 800 : 500,
        })
      }
      lotes.push(lote)
    }

    let cliente = await Cliente.query()
      .where('empresa_id', empresa.id)
      .where('nome', 'Cliente QA')
      .whereNull('deleted_at')
      .first()
    if (!cliente) {
      const ultimo = await Cliente.query()
        .where('empresa_id', empresa.id)
        .orderBy('numero', 'desc')
        .first()
      cliente = await Cliente.create({
        tipo: 'Pessoa Jurídica',
        nome: 'Cliente QA',
        razao_social: 'Cliente QA, Lda.',
        nif: '5417896230',
        email: 'cliente.qa@example.com',
        empresa_id: empresa.id,
        numero: (ultimo?.numero ?? 0) + 1,
      } as any)
      this.logger.success('Cliente criado')
    }

    // Uma proforma com itens: sem ela não há como verificar no browser que o botão "Imprimir"
    // imprime o documento em vez do layout da página.
    const proformaExistente = await Vendas.query()
      .where('caixa_id', caixa.id)
      .where('status', 'proforma')
      .whereNull('deleted_at')
      .first()
    if (!proformaExistente) {
      const ultimo = await Vendas.query()
        .where('empresa_id', empresa.id)
        .orderBy('numero', 'desc')
        .first()
      const itens = [
        { lote: lotes[0]!, quantidade: 3 },
        { lote: lotes[1]!, quantidade: 2 },
      ]
      const total = itens.reduce((soma, i) => soma + Number(i.lote.preco_venda) * i.quantidade, 0)

      const proforma = await Vendas.create({
        caixa_id: caixa.id,
        empresa_id: empresa.id,
        numero: (ultimo?.numero ?? 0) + 1,
        cliente_presencial_id: cliente.id,
        total,
        status: 'proforma',
        venda_tipo: 'presencial',
      } as any)

      for (const { lote, quantidade } of itens) {
        await VendaItens.create({
          venda_id: proforma.id,
          lote_produto_id: lote.id,
          quantidade,
          preco_unitario: lote.preco_venda,
          total: Number(lote.preco_venda) * quantidade,
          quantidade_reembolsada: 0,
        })
      }
      this.logger.success(`Proforma criada (nº ${proforma.numero}, total ${total.toFixed(2)})`)
    }

    this.logger.info('Dados operacionais prontos (posto, caixa, produtos, cliente, proforma)')
  }
}
