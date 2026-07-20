import { test } from '@japa/runner'
import { applyCommonFilters, applyRange, applyDeletedFilter } from '../../app/helpers/query_filters.js'

/** Query fake que só regista as chamadas, para verificar exactamente que cláusulas o helper monta. */
function fakeQuery() {
  const calls: any[] = []
  const query: any = {
    where: (...args: any[]) => (calls.push(['where', ...args]), query),
    whereBetween: (...args: any[]) => (calls.push(['whereBetween', ...args]), query),
    whereNull: (...args: any[]) => (calls.push(['whereNull', ...args]), query),
    whereNotNull: (...args: any[]) => (calls.push(['whereNotNull', ...args]), query),
  }
  return { query, calls }
}

test.group('query_filters.applyRange', () => {
  test('usa whereBetween quando start e end estão presentes', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyRange(query, 'tabela.total', 100, 200)
    assert.deepEqual(calls, [['whereBetween', 'tabela.total', [100, 200]]])
  })

  test('usa >= quando só start está presente', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyRange(query, 'tabela.total', 100)
    assert.deepEqual(calls, [['where', 'tabela.total', '>=', 100]])
  })

  test('usa <= quando só end está presente', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyRange(query, 'tabela.total', undefined, 200)
    assert.deepEqual(calls, [['where', 'tabela.total', '<=', 200]])
  })

  test('não aplica nada quando nem start nem end estão presentes', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyRange(query, 'tabela.total')
    assert.lengthOf(calls, 0)
  })

  test('converte Date para ISO string', ({ assert }) => {
    const { query, calls } = fakeQuery()
    const data = new Date('2026-01-01T00:00:00.000Z')
    applyRange(query, 'tabela.data', data)
    assert.deepEqual(calls, [['where', 'tabela.data', '>=', data.toISOString()]])
  })
})

test.group('query_filters.applyDeletedFilter', () => {
  test('deleted=deleted mostra só apagados', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyDeletedFilter(query, 'tabela', 'deleted')
    assert.deepEqual(calls, [['whereNotNull', 'tabela.deleted_at']])
  })

  test('deleted=all não filtra', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyDeletedFilter(query, 'tabela', 'all')
    assert.lengthOf(calls, 0)
  })

  test('omisso mostra só os não-apagados', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyDeletedFilter(query, 'tabela', undefined)
    assert.deepEqual(calls, [['whereNull', 'tabela.deleted_at']])
  })
})

test.group('query_filters.applyCommonFilters', () => {
  test('aplica deleted, datas de auditoria e campos exact/like/range', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyCommonFilters(query, {
      deleted: 'all',
      createdDtStart: 100,
      nome: 'Produto',
      marca_id: 'marca-1',
      is_service: false,
    }, {
      table: 'produtos',
      fields: [
        { kind: 'like', column: 'produtos.nome', key: 'nome' },
        { kind: 'exact', column: 'produtos.marca_id', key: 'marca_id' },
        { kind: 'exact', column: 'produtos.is_service', key: 'is_service' },
      ],
    })

    assert.deepEqual(calls, [
      ['where', 'produtos.created_at', '>=', 100],
      ['where', 'produtos.nome', 'like', '%Produto%'],
      ['where', 'produtos.marca_id', 'marca-1'],
      // is_service: false é um valor válido — tem de passar, não pode ser tratado como "ausente".
      ['where', 'produtos.is_service', false],
    ])
  })

  test('campo range: valor exacto vence sobre o par start/end', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyCommonFilters(query, { quantidade: 5, quantidade_start: 1, quantidade_end: 10 }, {
      table: 'estoque',
      fields: [
        { kind: 'range', column: 'estoque.quantidade', startKey: 'quantidade_start', endKey: 'quantidade_end', exactKey: 'quantidade' },
      ],
    })

    assert.deepEqual(calls, [
      ['whereNull', 'estoque.deleted_at'],
      ['where', 'estoque.quantidade', 5],
    ])
  })

  test('campo range: usa start/end quando não há valor exacto', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyCommonFilters(query, { quantidade_start: 1, quantidade_end: 10 }, {
      table: 'estoque',
      fields: [
        { kind: 'range', column: 'estoque.quantidade', startKey: 'quantidade_start', endKey: 'quantidade_end', exactKey: 'quantidade' },
      ],
    })

    assert.deepEqual(calls, [
      ['whereNull', 'estoque.deleted_at'],
      ['whereBetween', 'estoque.quantidade', [1, 10]],
    ])
  })

  test('não aplica um campo like quando o valor não é fornecido', ({ assert }) => {
    const { query, calls } = fakeQuery()
    applyCommonFilters(query, {}, {
      table: 'produtos',
      fields: [{ kind: 'like', column: 'produtos.nome', key: 'nome' }],
    })

    assert.deepEqual(calls, [['whereNull', 'produtos.deleted_at']])
  })
})
