import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import fs from 'node:fs'
import path from 'node:path'
import db from '@adonisjs/lucid/services/db'
import cobrancaRepository from '#repositories/cobranca_repository'
import pessoaRepository from '#repositories/pessoa_repository'
import Plano from '#models/plano'
import Subscricao from '#models/subscricao'
import { createEmpresa } from '../helpers/fixtures.js'

/**
 * "Colunas fantasma": propriedades declaradas com `@column()` num model que NÃO
 * existem na tabela.
 *
 * São inertes enquanto ninguém as escreve — o Lucid só insere os atributos
 * atribuídos, e um `SELECT *` simplesmente não as traz. Tornam-se um 500
 * "Unknown column" no dia em que um validador as aceitar e o repositório as
 * passar ao model. Foi isso que aconteceu a `cobranca.data_emissao` e a
 * `pessoa.ativo`, ambos alcançáveis a partir de um pedido HTTP normal.
 *
 * A origem é sempre a mesma: a linha existe na migração, comentada. Havia 38
 * dessas linhas espalhadas por `database/migrations/`.
 */
test.group('colunas fantasma', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * A rede que impede isto de voltar a acontecer, para QUALQUER model.
   *
   * Compara o que cada model declara com o que a base de dados tem de facto. É
   * barato (uma consulta a `information_schema`) e apanha o problema no momento
   * em que alguém acrescenta um `@column()` sem a migração correspondente —
   * momento em que custa um minuto a corrigir, em vez de um 500 em produção.
   */
  test('nenhum model declara uma coluna que a base de dados não tem', async ({ assert }) => {
    const linhas = await db.rawQuery(
      'SELECT table_name AS t, column_name AS col FROM information_schema.columns WHERE table_schema = DATABASE()'
    )

    const porTabela = new Map<string, Set<string>>()
    for (const r of linhas[0] as any[]) {
      const tabela = String(r.t ?? r.TABLE_NAME)
      const coluna = String(r.col ?? r.COLUMN_NAME)
      if (!porTabela.has(tabela)) porTabela.set(tabela, new Set())
      porTabela.get(tabela)!.add(coluna)
    }

    function ficheiros(dir: string): string[] {
      const saida: string[] = []
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) saida.push(...ficheiros(p))
        else if (e.name.endsWith('.ts')) saida.push(p)
      }
      return saida
    }

    const camelParaSnake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    const problemas: string[] = []

    for (const f of ficheiros('app/models')) {
      const src = fs.readFileSync(f, 'utf8')
      const tabela = src.match(/static table = '([^']+)'/)?.[1] ?? path.basename(f, '.ts')
      const reais = porTabela.get(tabela)

      if (!reais) {
        problemas.push(`${path.basename(f)}: a tabela "${tabela}" não existe`)
        continue
      }

      const re = /@column(?:\.dateTime|\.date)?\(([^)]*)\)\s*\n\s*declare\s+(\w+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        const coluna = m[1].match(/columnName:\s*'([^']+)'/)?.[1] ?? camelParaSnake(m[2])
        if (!reais.has(coluna)) problemas.push(`${tabela}.${coluna} (declarada em ${path.basename(f)})`)
      }
    }

    assert.deepEqual(
      problemas,
      [],
      'cada uma destas é um 500 "Unknown column" à espera de quem lhe escreva'
    )
  })

  test('POST cobranca grava a data de emissão em vez de rebentar', async ({ assert }) => {
    // `data_emissao` é OBRIGATÓRIA no validador, portanto todos os pedidos a
    // enviavam — e todos rebentavam com "Unknown column". O endpoint estava
    // completamente inutilizável.
    const empresa = await createEmpresa()
    const plano = await Plano.create({
      nome: `Plano ${Date.now()}`,
      descricao: 'teste',
      preco: 1000,
      moeda: 'AOA',
      periodo: 'mensal',
      ativo: true,
      limite_uso: 10,
    } as any)

    const subscricao = await Subscricao.create({
      cliente_id: empresa.id,
      plano_id: plano.id,
      status: 'ATIVA',
      data_inicio: new Date() as any,
      data_fim: new Date(Date.now() + 30 * 86400000) as any,
      renova: true,
    } as any)

    const emissao = new Date('2026-03-01T00:00:00.000Z')
    const criada = await new cobrancaRepository().create({
      subscricao_id: subscricao.id,
      valor: 1000,
      moeda: 'AOA',
      status: 'PENDENTE',
      data_emissao: emissao,
      data_vencimento: new Date('2026-03-31T00:00:00.000Z'),
      pago: false,
      referencia: 'REF-TESTE',
    } as any)

    assert.isNotNull(criada.id)
    const relida = await db.from('cobranca').where('id', criada.id).first()
    assert.isNotNull(relida.data_emissao, 'a data tem de chegar mesmo à tabela')
  })

  test('criar uma pessoa com "ativo" não rebenta', async ({ assert }) => {
    // `ativo` era aceite pelo validador (create e update) e não existia na tabela.
    const empresa = await createEmpresa()

    const pessoa = await new pessoaRepository().create({
      nome: 'Fulano de Teste',
      tipo: 'Cliente',
      ativo: true,
      company_alias: empresa.company_alias,
    } as any)

    assert.isNotNull(pessoa.id)
    const relida = await db.from('pessoa').where('id', pessoa.id).first()
    assert.equal(Number(relida.ativo), 1)
  })
})
