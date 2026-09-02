import { BaseCommand } from '@adonisjs/core/ace'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Empresa from '#models/empresa'
import User from '#models/user'
import UserPapel from '#models/auth/user_papel'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import VerificationTokenHash from '#models/verification_token_hash'
import Pos from '#models/faturacao/pos'
import Caixa from '#models/caixa'
import Produtos from '#models/faturacao/produtos'
import Lote from '#models/faturacao/lote'
import Cliente from '#models/cliente'
import Vendas from '#models/faturacao/vendas'
import VendaItens from '#models/faturacao/venda_itens'
import VendaPagamento from '#models/vendapagamento'
import MetodoPagamento from '#models/metodopagamento'
import Factura from '#models/faturacao/factura'
import { giveRoleToUser } from '../app/helpers/Utils.js'
import { clonarPapeisPadrao } from '../app/helpers/papeis_da_empresa.js'
import { semearMetodosPagamento } from '../app/helpers/metodos_pagamento_padrao.js'
import { proximoNumeroPorEmpresa } from '../app/helpers/sequencial_numero.js'
import OnboardingRepository from '#repositories/onboarding_repository'
import VendasRepository from '#repositories/vendas_repository'
import FacturaRepository from '#repositories/factura_repository'
import ProdutosReembolsoRepository from '#repositories/produtos_reembolso_repository'

/**
 * TEMPORÁRIO — ambiente de desenvolvimento do dono do produto.
 *
 * Recria a empresa `bknkv`, o utilizador `jmyork` e um conjunto de vendas que
 * percorre os quatro caminhos de facturação, para os ecrãs terem o que mostrar
 * depois de um `migration:fresh:seed` (que, por decisão registada no seeder, não
 * cria conta nenhuma).
 *
 * A password vem de `SEED_PASSWORD` no ambiente e nunca fica escrita neste
 * ficheiro — o seeder principal recusa semear contas precisamente por isso.
 *
 *   SEED_PASSWORD=... node ace semear:bknkv-temp
 */
export default class SemearBknkvTemp extends BaseCommand {
  static commandName = 'semear:bknkv-temp'
  static description = 'Cria a empresa bknkv, o utilizador jmyork e dados de demonstração'
  static options = { startApp: true }

  private alias = 'bknkv'

  async run() {
    const password = process.env.SEED_PASSWORD
    if (!password) {
      this.logger.error('Falta SEED_PASSWORD no ambiente.')
      this.exitCode = 1
      return
    }

    // ── Empresa ───────────────────────────────────────────────────────────────
    let empresa = await Empresa.findBy('company_alias', this.alias)
    if (!empresa) {
      empresa = await Empresa.create({
        nome: 'BKNKV Comércio',
        nif: '5000123456',
        tamanho: 'pequena',
        status: true,
        inadiplente: false,
        regime_iva: true,
        company_alias: this.alias,
        localizacao: 'Luanda',
        contacto: '923000000',
        verified: true,
      } as any)
      this.logger.success(`Empresa criada: ${this.alias}`)
    }

    const clonados = await clonarPapeisPadrao(empresa.id)
    if (clonados > 0) this.logger.success(`Papéis da empresa clonados: ${clonados}`)

    // ── Utilizador ────────────────────────────────────────────────────────────
    const email = 'jmyork@bknkv.ao'
    let user = await User.findBy('email', email)
    if (!user) {
      user = await User.create({
        username: 'jmyork',
        email,
        password,
        empresa_id: empresa.id,
      })
      this.logger.success(`Utilizador criado: jmyork <${email}>`)
    }

    const tokenExistente = await VerificationTokenHash.query()
      .where('user_id', user.id)
      .where('purpose', 'account_activation')
      .first()

    if (!tokenExistente) {
      await VerificationTokenHash.create({
        user_id: user.id,
        empresa_id: empresa.id,
        purpose: 'account_activation',
        verification_token_public: randomUUID(),
        verification_token_hash: randomUUID(),
        verified: true,
      })
      this.logger.success('Conta activada')
    }

    const adminPapel = await Papel.query()
      .where('nome', 'Admin')
      .where('empresa_id', empresa.id)
      .where('escopo', ESCOPO_PAPEL.empresa)
      .whereNull('deleted_at')
      .firstOrFail()

    const temPapel = await UserPapel.query()
      .where('user_id', user.id)
      .where('papel_id', adminPapel.id)
      .whereNull('deleted_at')
      .first()

    if (!temPapel) {
      await giveRoleToUser(user, 'Admin')
      this.logger.success('Papel Admin atribuído')
    }

    // ── Estrutura operacional ────────────────────────────────────────────────
    await semearMetodosPagamento(empresa.id)

    let pos = await Pos.query().where('empresa_id', empresa.id).whereNull('deleted_at').first()
    if (!pos) {
      pos = await Pos.create({
        nome: 'Loja Central',
        localizacao: 'Luanda, Talatona',
        contacto: '923000001',
        email: 'loja.central@bknkv.ao',
        empresa_id: empresa.id,
      })
      this.logger.success('Posto de atendimento criado')
    }

    if (!empresa.onboardingConcluido) {
      await new OnboardingRepository().concluir({ company_alias: this.alias })
      this.logger.success('Onboarding concluído')
    }

    let caixa = await Caixa.query()
      .where('pos_id', pos.id)
      .where('status', 'Aberto')
      .whereNull('deleted_at')
      .first()

    if (!caixa) {
      caixa = await db.transaction(async (trx) => {
        const numero = await proximoNumeroPorEmpresa(trx, empresa!.id, Caixa)
        return Caixa.create(
          {
            user_id: user!.id,
            pos_id: pos!.id,
            empresa_id: empresa!.id,
            numero,
            valor_inicial: 20000,
            total_vendas: 0,
            total_caixa: 20000,
            status: 'Aberto',
            observacoes: 'Caixa de trabalho',
          },
          { client: trx }
        )
      })
      this.logger.success('Caixa aberta')
    }

    // ── Catálogo ──────────────────────────────────────────────────────────────
    const catalogo: Array<{ nome: string; venda: number; compra: number; stock: number }> = [
      { nome: 'Arroz Agulha 5kg', venda: 4750.5, compra: 3200, stock: 120 },
      { nome: 'Óleo Alimentar 900ml', venda: 1899.99, compra: 1250, stock: 200 },
      { nome: 'Açúcar Branco 1kg', venda: 990.0, compra: 640, stock: 300 },
      { nome: 'Leite UHT 1L', venda: 1450.25, compra: 980, stock: 150 },
      { nome: 'Detergente Multiusos 2L', venda: 2350.0, compra: 1500, stock: 80 },
    ]

    const lotes: Lote[] = []
    for (const item of catalogo) {
      let produto = await Produtos.query()
        .where('empresa_id', empresa.id)
        .where('nome', item.nome)
        .whereNull('deleted_at')
        .first()

      if (!produto) {
        const ultimo = await Produtos.query()
          .where('empresa_id', empresa.id)
          .orderBy('numero', 'desc')
          .first()
        produto = await Produtos.create({
          nome: item.nome,
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
          data_validade: DateTime.now().plus({ months: 10 }).toJSDate() as any,
          data_fabrico: DateTime.now().minus({ months: 2 }).toJSDate() as any,
          quantidade_em_estoque: item.stock,
          preco_venda: item.venda,
          preco_compra: item.compra,
        })
      }
      lotes.push(lote)
    }
    this.logger.success(`${lotes.length} produtos com lote e stock`)

    // ── Clientes ──────────────────────────────────────────────────────────────
    const clientes: Cliente[] = []
    const porCriar = [
      { nome: 'Mercearia do Bairro, Lda.', nif: '5417896230', tipo: 'Pessoa Jurídica' },
      { nome: 'Ana Cabral', nif: '003456789LA042', tipo: 'Pessoa Física' },
      { nome: 'Distribuidora Kwanza, S.A.', nif: '5000998877', tipo: 'Pessoa Jurídica' },
    ]

    for (const c of porCriar) {
      let cliente = await Cliente.query()
        .where('empresa_id', empresa.id)
        .where('nome', c.nome)
        .whereNull('deleted_at')
        .first()

      if (!cliente) {
        const ultimo = await Cliente.query()
          .where('empresa_id', empresa.id)
          .orderBy('numero', 'desc')
          .first()
        cliente = await Cliente.create({
          tipo: c.tipo,
          nome: c.nome,
          nif: c.nif,
          empresa_id: empresa.id,
          numero: (ultimo?.numero ?? 0) + 1,
        } as any)
      }
      clientes.push(cliente)
    }
    this.logger.success(`${clientes.length} clientes`)

    // ── As vendas ─────────────────────────────────────────────────────────────
    //
    // Já existem? Não repete — o comando pode correr as vezes que forem precisas.
    const jaHaVendas = await Vendas.query()
      .where('empresa_id', empresa.id)
      .whereNot('status', 'aberta')
      .first()

    if (jaHaVendas) {
      this.logger.info('Já existem vendas — nada mais a semear.')
      this.credenciais(password)
      return
    }

    const vendasRepo = new VendasRepository()
    const facturaRepo = new FacturaRepository()

    /** Abre uma venda com itens e devolve-a pronta a fechar. */
    const abrirVenda = async (
      itens: Array<{ lote: Lote; quantidade: number }>,
      cliente: Cliente | null
    ) => {
      const ultimo = await Vendas.query()
        .where('empresa_id', empresa!.id)
        .orderBy('numero', 'desc')
        .first()

      const venda = await Vendas.create({
        caixa_id: caixa!.id,
        empresa_id: empresa!.id,
        numero: (ultimo?.numero ?? 0) + 1,
        cliente_presencial_id: cliente?.id ?? null,
        total: 0,
        status: 'aberta',
        venda_tipo: 'presencial',
      } as any)

      let total = 0
      for (const { lote, quantidade } of itens) {
        const valor = Math.round(Number(lote.preco_venda) * quantidade * 100) / 100
        total += valor
        await VendaItens.create({
          venda_id: venda.id,
          lote_produto_id: lote.id,
          quantidade,
          preco_unitario: lote.preco_venda,
          total: valor,
          quantidade_reembolsada: 0,
        })
      }

      venda.total = Math.round(total * 100) / 100
      await venda.save()
      return venda
    }

    /*
     * O pagamento liga-se ao MÉTODO por id, não por um nome escrito à mão — a
     * coluna é `metodo_pagamento_id`, e o modelo recusa uma propriedade que não
     * declara. Os métodos já foram semeados acima por `semearMetodosPagamento`.
     */
    const metodoNumerario = await MetodoPagamento.query()
      .where('empresa_id', empresa.id)
      .orderBy('created_at', 'asc')
      .firstOrFail()

    const pagar = async (venda: Vendas) => {
      await VendaPagamento.create({
        venda_id: venda.id,
        metodo_pagamento_id: metodoNumerario.id,
        valor: Number(venda.total),
      } as any)
    }

    const fechar = (venda: Vendas, extra: Record<string, unknown> = {}) =>
      vendasRepo.close({
        id: venda.id,
        user_id: user!.id,
        company_alias: this.alias,
        ...extra,
      } as any)

    // 1 — Pronto pagamento sem cliente → Factura Genérica
    const v1 = await abrirVenda([{ lote: lotes[0]!, quantidade: 2 }, { lote: lotes[2]!, quantidade: 3 }], null)
    await pagar(v1)
    await fechar(v1)
    this.logger.success('Venda 1: pronto pagamento sem NIF → Factura Genérica')

    // 2 — Pronto pagamento com cliente identificado → Factura-Recibo
    const v2 = await abrirVenda([{ lote: lotes[1]!, quantidade: 4 }], clientes[0]!)
    await pagar(v2)
    await fechar(v2)
    this.logger.success('Venda 2: pronto pagamento com NIF → Factura-Recibo')

    // 3 — A crédito, ainda dentro do prazo → Factura por receber
    const v3 = await abrirVenda([{ lote: lotes[4]!, quantidade: 5 }], clientes[2]!)
    await fechar(v3, { condicao_pagamento: 'credito', prazo_pagamento_dias: 30 })
    this.logger.success('Venda 3: a crédito, 30 dias → Factura em dívida')

    // 4 — A crédito e já recebida → Factura + Recibo
    const v4 = await abrirVenda([{ lote: lotes[3]!, quantidade: 6 }], clientes[0]!)
    await fechar(v4, { condicao_pagamento: 'credito', prazo_pagamento_dias: 15 })
    const factura4 = await Factura.query().where('venda_id', v4.id).firstOrFail()
    await facturaRepo.confirmarRecebimento({
      id: factura4.id,
      company_alias: this.alias,
      emitido_por_user_id: user.id,
    })
    this.logger.success('Venda 4: a crédito, já recebida → Factura + Recibo')

    /*
     * 5 — A crédito e VENCIDA, para o mapa de cobranças ter o que reclamar.
     *
     * O prazo é escrito à mão depois do fecho: `close()` calcula o vencimento a
     * partir de hoje, e uma factura que só vence daqui a dias não mostra o estado
     * "venceu" que este ecrã precisa de exercitar.
     */
    const v5 = await abrirVenda([{ lote: lotes[0]!, quantidade: 3 }], clientes[2]!)
    await fechar(v5, { condicao_pagamento: 'credito', prazo_pagamento_dias: 15 })
    const factura5 = await Factura.query().where('venda_id', v5.id).firstOrFail()
    factura5.data_vencimento = DateTime.now().minus({ days: 12 })
    await factura5.save()
    this.logger.success('Venda 5: a crédito, VENCIDA há 12 dias')

    // 6 — Adiantamento por entregar → Factura de Adiantamento
    const v6 = await abrirVenda([{ lote: lotes[1]!, quantidade: 10 }], clientes[1]!)
    await pagar(v6)
    await fechar(v6, { condicao_pagamento: 'adiantamento' })
    this.logger.success('Venda 6: adiantamento POR ENTREGAR → Factura de Adiantamento')

    // 7 — Adiantamento já entregue → FA + Nota de Crédito + Factura-Recibo
    const v7 = await abrirVenda([{ lote: lotes[2]!, quantidade: 8 }], clientes[0]!)
    await pagar(v7)
    await fechar(v7, { condicao_pagamento: 'adiantamento' })
    await vendasRepo.entregar({ id: v7.id, user_id: user.id, company_alias: this.alias } as any)
    this.logger.success('Venda 7: adiantamento ENTREGUE → FA + NC + Factura-Recibo')

    // 8 — Venda reembolsada parcialmente → Factura-Recibo + Nota de Crédito
    const v8 = await abrirVenda([{ lote: lotes[3]!, quantidade: 4 }], clientes[0]!)
    await pagar(v8)
    await fechar(v8)
    const itemDeV8 = await VendaItens.query().where('venda_id', v8.id).firstOrFail()
    await new ProdutosReembolsoRepository().reembolsar_parcial({
      venda_id: v8.id,
      venda_item_id: itemDeV8.id,
      quantidade: 1,
      motivo: 'Embalagem danificada.',
      user_id: user.id,
      company_alias: this.alias,
    } as any)
    this.logger.success('Venda 8: reembolso parcial → Factura-Recibo + Nota de Crédito')

    // `.count()` devolve o valor em `$extras`, sob o alias tal e qual — não como
    // propriedade do modelo. Sem isso saía "undefined" no fim de um comando cujo
    // propósito é justamente dizer o que ficou feito.
    const documentos = await Factura.query().where('empresa_id', empresa.id).count('* as total')
    this.logger.info(`Documentos fiscais emitidos: ${(documentos[0] as any).$extras?.total ?? '?'}`)

    this.credenciais(password)
  }

  private credenciais(password: string) {
    this.logger.success('Pronto.')
    console.log({
      company_alias: this.alias,
      utilizador: 'jmyork',
      email: 'jmyork@bknkv.ao',
      password,
    })
  }
}
