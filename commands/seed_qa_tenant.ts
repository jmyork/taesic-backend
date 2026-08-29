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
import { clonarPapeisPadrao } from '../app/helpers/papeis_da_empresa.js'
import OnboardingRepository from '#repositories/onboarding_repository'
import db from '@adonisjs/lucid/services/db'
import { proximoNumeroPorEmpresa } from '../app/helpers/sequencial_numero.js'
import { ESCOPO_PAPEL } from '#models/auth/papel'
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

    /**
     * Os papéis DESTA empresa.
     *
     * Sem isto o comando estava partido desde que os papéis passaram a pertencer a uma
     * empresa (CLAUDE.md 7.13): a empresa era criada com `Empresa.create` directamente,
     * que não passa por `CreateEmpresaUserDetalhes` e portanto nunca clonava nada. O
     * `giveRoleToUser` mais abaixo rebentava com «Não existe o papel "Admin" no âmbito
     * "empresa"», já depois de ter criado a empresa e o utilizador — deixava um inquilino
     * de QA a meio, sem administrador, e nenhum dos testes de browser podia correr.
     *
     * `clonarPapeisPadrao` é idempotente (compara por nome), portanto corre sempre: assim
     * também repara um inquilino que tenha ficado nesse estado.
     */
    const clonados = await clonarPapeisPadrao(empresa.id)
    if (clonados > 0) this.logger.success(`Papéis da empresa clonados: ${clonados}`)

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

    // Pelo par (empresa, nome), nunca só pelo nome: desde 7.13 há um "Admin" por
    // empresa mais o MODELO com o mesmo nome, e `findByOrFail('nome', 'Admin')`
    // devolveria qualquer um deles. Devolvendo o modelo, a verificação seguinte nunca
    // encontrava a atribuição (que aponta para a cópia) e o comando tentava atribuir o
    // papel outra vez em cada corrida.
    const adminPapel = await Papel.query()
      .where('nome', 'Admin')
      .where('empresa_id', empresa.id)
      .where('escopo', ESCOPO_PAPEL.empresa)
      .whereNull('deleted_at')
      .firstOrFail()
    const hasAdminRole = await UserPapel.query()
      .where('user_id', user.id)
      .where('papel_id', adminPapel.id)
      .whereNull('deleted_at')
      .first()
    if (!hasAdminRole) {
      await giveRoleToUser(user, 'Admin')
      this.logger.success('Papel Admin atribuído')
    } else {
      this.logger.info('Papel Admin já atribuído')
    }

    await this.semearDadosOperacionais(empresa, user)

    /**
     * O onboarding tem de estar CONCLUÍDO.
     *
     * Desde que passou a ser obrigatório (CLAUDE.md 7.21), o `ProtectedRoute` prende
     * qualquer sessão de uma empresa por configurar em `/[alias]/onboarding`. Um
     * inquilino de QA nesse estado faz todos os testes de browser pararem no primeiro
     * ecrã — o login passa e mais nada passa, o que é o pior sintoma possível porque
     * parece um problema da página que se está a testar.
     *
     * Pelo repositório real e não escrevendo a coluna à mão: é o mesmo caminho que uma
     * empresa a sério percorre, portanto ganha também a subscrição no plano de arranque
     * (`garantirSubscricao`) e o posto em falta, se houver. É idempotente.
     */
    if (!empresa.onboardingConcluido) {
      await new OnboardingRepository().concluir({ company_alias: COMPANY_ALIAS })
      this.logger.success('Onboarding marcado como concluído')
    } else {
      this.logger.info('Onboarding já estava concluído')
    }

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
    /**
     * A caixa TEM de ter `empresa_id`, e não é um detalhe de arrumação.
     *
     * `vendas_repository.create()` copia o `empresa_id` da CAIXA para a venda, e sem ele
     * segue por um ramo alternativo que grava a venda sem `empresa_id` **e sem número
     * sequencial**. Esta caixa era criada com `Caixa.create` directamente, sem esse campo
     * — ao contrário de `caixa_repository.open()`, que o preenche a partir do utilizador.
     *
     * O resultado: o inquilino de QA produzia vendas que a produção nunca produz. As
     * facturas saíam identificadas por um pedaço de UUID em vez de "FAT-000001", e —
     * o que é pior — `faturacaoDoMes()` filtra por `vendas.empresa_id`, portanto o tecto
     * de facturação do plano nunca contaria nenhuma delas. Um teste do 402 do tecto
     * passaria por não encontrar vendas, e não por o limite funcionar.
     *
     * É a mesma lição de CLAUDE.md 7.22: uma fixture que produz um estado que a produção
     * nunca cria faz testes passarem sobre uma realidade que não existe.
     */
    let caixa = await Caixa.query()
      .where('pos_id', pos.id)
      .where('status', 'Aberto')
      .whereNull('deleted_at')
      .first()
    if (!caixa) {
      caixa = await db.transaction(async (trx) => {
        const numero = await proximoNumeroPorEmpresa(trx, empresa.id, Caixa)
        return Caixa.create(
          {
            user_id: user.id,
            pos_id: pos.id,
            empresa_id: empresa.id,
            numero,
            valor_inicial: 0,
            total_vendas: 0,
            total_caixa: 0,
            status: 'Aberto',
            observacoes: 'Caixa de testes automatizados',
          },
          { client: trx }
        )
      })
      this.logger.success('Caixa aberta criada')
    } else if (!caixa.empresa_id) {
      // Repara uma caixa deixada pela versão anterior deste comando. Sem isto, uma
      // máquina que já tenha corrido o comando continuaria a produzir vendas órfãs.
      await db.transaction(async (trx) => {
        caixa!.useTransaction(trx)
        caixa!.empresa_id = empresa.id
        if (!caixa!.numero) {
          caixa!.numero = await proximoNumeroPorEmpresa(trx, empresa.id, Caixa)
        }
        await caixa!.save()
      })
      this.logger.success('Caixa existente ligada à empresa (estava sem empresa_id)')
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
