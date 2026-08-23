import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { randomUUID } from 'node:crypto'
import { createpapel_permissaoValidator } from '#validators/papel_permissao_validator'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import Permissao from '#models/auth/permissao'
import papel_permissao from '#models/auth/papel_permissao'

/**
 * `POST api/papel-permissao` estava impossível de usar, por três defeitos ao mesmo
 * tempo no validador:
 *
 *  1. o `.unique()` consultava `user_papel` — a tabela errada;
 *  2. fazia `!(await db.from(...))` sem `.first()`: esperar por um query builder
 *     devolve um ARRAY, e um array vazio é truthy, portanto o `!` dava sempre
 *     `false` ("não é único") e a validação **rejeitava sempre**, mesmo um par
 *     inteiramente novo;
 *  3. o `.exists()` usava `exists !== undefined`, e `.first()` devolve `null`
 *     quando não há linha — logo dava sempre `true`, e um id inexistente passava
 *     até rebentar na chave estrangeira, com 500 em vez de 400.
 *
 * Os defeitos 2 e 3 cancelavam-se na aparência (um rejeitava tudo, o outro aceitava
 * tudo), o que é provavelmente a razão de nenhum ter sido notado.
 */
test.group('papel_permissao_validator', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function parNovo() {
    const papel = await Papel.create({
      nome: `Modelo ${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      escopo: ESCOPO_PAPEL.modelo,
    })
    const permissao = await Permissao.create({
      nome: `teste.permissao.${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
    })
    return { papel, permissao }
  }

  test('aceita um par papel+permissão novo', async ({ assert }) => {
    // Antes: rejeitava sempre — o `.unique()` devolvia `false` para tudo.
    const { papel, permissao } = await parNovo()

    const validado = await createpapel_permissaoValidator.validate({
      papel_id: papel.id,
      permissao_id: permissao.id,
    })

    assert.equal(validado.papel_id, papel.id)
    assert.equal(validado.permissao_id, permissao.id)
  })

  test('recusa um par que já existe', async ({ assert }) => {
    const { papel, permissao } = await parNovo()
    await papel_permissao.create({ papel_id: papel.id, permissao_id: permissao.id })

    await assert.rejects(() =>
      createpapel_permissaoValidator.validate({
        papel_id: papel.id,
        permissao_id: permissao.id,
      })
    )
  })

  test('recusa um par com soft delete, tal como a constraint da BD', async ({ assert }) => {
    // `unique(papel_id, permissao_id)` cobre também as linhas removidas, portanto
    // aceitar aqui só trocaria um 400 legível por um erro de chave duplicada.
    const { papel, permissao } = await parNovo()
    const linha = await papel_permissao.create({
      papel_id: papel.id,
      permissao_id: permissao.id,
    })
    linha.deletedAt = (await import('luxon')).DateTime.now()
    await linha.save()

    await assert.rejects(() =>
      createpapel_permissaoValidator.validate({
        papel_id: papel.id,
        permissao_id: permissao.id,
      })
    )
  })

  test('recusa um papel_id que não existe, em vez de deixar rebentar na chave estrangeira', async ({
    assert,
  }) => {
    const { permissao } = await parNovo()

    await assert.rejects(() =>
      createpapel_permissaoValidator.validate({
        papel_id: randomUUID(),
        permissao_id: permissao.id,
      })
    )
  })

  test('recusa uma permissao_id que não existe', async ({ assert }) => {
    const { papel } = await parNovo()

    await assert.rejects(() =>
      createpapel_permissaoValidator.validate({
        papel_id: papel.id,
        permissao_id: randomUUID(),
      })
    )
  })
})
