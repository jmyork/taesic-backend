import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import { CreateCompanyWithUserAndStartACompanyDetalhes } from '#validators/empresa_validator'
import { createEmpresa } from '../helpers/fixtures.js'

/**
 * O NIF no registo de empresa — camada 1 do KYC.
 *
 * O que estes testes cobrem é **higiene do campo**, não verificação de identidade.
 * Nada aqui prova que o NIF existe, e muito menos que é de quem o escreve: hoje
 * qualquer pessoa abre uma conta com o NIF de uma empresa real e passa a emitir
 * facturas em nome dela. Isso está documentado em CLAUDE.md §7.16 e precisa de
 * decisão de produto (consulta ao portal, prova de posse, aprovação no backoffice).
 *
 * O que se fecha aqui são defeitos puros, sem regra de negócio pelo meio:
 *
 *  - a unicidade contornava-se com um espaço à frente do NIF;
 *  - a unicidade vivia só no validador, portanto era uma corrida entre dois registos
 *    simultâneos e não cobria nenhum caminho que não passasse por ele;
 *  - não havia limite de comprimento nem alfabeto, e um NIF com 300 caracteres saía
 *    como 500 (a coluna é `varchar(255)` e o `sql_mode` tem `STRICT_TRANS_TABLES`).
 */
test.group('registo de empresa — NIF', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Um payload de registo válido, com o NIF por cima. */
  function payload(nif: string) {
    const suffix = randomUUID().slice(0, 8)
    return {
      user_username: `dono${suffix}`,
      user_email: `dono.${suffix}@bknkv.com`,
      user_password: 'Password123!#',
      dados_nome: 'Jose',
      dados_sobrenome: 'Baptista',
      empresa_nif: nif,
      empresa_company_alias: `empresa-nova-${'abcdefgh'.slice(0, 8)}`,
      empresa_nome: `Empresa Nova ${suffix}`,
      empresa_contacto: '900000000',
    }
  }

  test('recusa um NIF com caracteres que não são letras nem dígitos', async ({ assert }) => {
    await assert.rejects(() =>
      CreateCompanyWithUserAndStartACompanyDetalhes.validate(payload("5000' OR 1=1"))
    )
  })

  test('recusa um NIF demasiado longo', async ({ assert }) => {
    // A coluna é varchar(255) e o sql_mode é estrito: sem `maxLength` isto chegava ao
    // INSERT e saía como um 500 em vez de um 400 legível.
    await assert.rejects(() =>
      CreateCompanyWithUserAndStartACompanyDetalhes.validate(payload('5'.repeat(300)))
    )
  })

  test('um espaço à volta deixa de esconder um NIF já registado', async ({ assert }) => {
    const existente = await createEmpresa()

    // Este era o bug: sem `.trim()`, o `.unique()` procurava por `' NIF... '`, não
    // encontrava nada (verificado contra a coluna real) e deixava passar um segundo
    // registo com o mesmo NIF.
    await assert.rejects(() =>
      CreateCompanyWithUserAndStartACompanyDetalhes.validate(payload(` ${existente.nif} `))
    )
  })

  test('o NIF validado sai sem espaços', async ({ assert }) => {
    const validado = await CreateCompanyWithUserAndStartACompanyDetalhes.validate(
      payload('  5000000123  ')
    )

    // É o valor validado que o repositório grava — se o trim não chegasse aqui, o
    // espaço ficava na base de dados e o índice único não o apanharia.
    assert.equal(validado.empresa_nif, '5000000123')
  })

  test('a base de dados recusa dois NIFs iguais, mesmo sem passar pelo validador', async ({
    assert,
  }) => {
    const primeira = await createEmpresa()

    // Um comando ace, um seeder ou uma correcção à mão não passam pelo validador. Até
    // agora nada os impedia de duplicar um NIF; `empresa_nif_unique` impede.
    await assert.rejects(() =>
      Empresa.create({
        nome: `Clone ${randomUUID().slice(0, 8)}`,
        nif: primeira.nif,
        tamanho: 'pequena',
        status: true,
        inadiplente: false,
        regime_iva: false,
        company_alias: `clone-${randomUUID().slice(0, 8)}`,
        localizacao: 'Luanda',
        contacto: '900000000',
        verified: true,
        user_id: '',
      } as any)
    )
  })

  test('maiúsculas e minúsculas são o mesmo NIF', async ({ assert }) => {
    // Documenta a collation da coluna (`utf8mb4_0900_ai_ci`): o `.unique()` do validador
    // e o índice único concordam a ignorar maiúsculas, que é o que se quer — o que não
    // podia acontecer era um discordar do outro.
    const existente = await createEmpresa()
    const emMaiusculas = existente.nif.toUpperCase()
    const emMinusculas = existente.nif.toLowerCase()
    assert.notEqual(emMaiusculas, emMinusculas, 'o NIF da fixture tem letras, senão o teste não diz nada')

    const linha = await db.from('empresa').where('nif', emMinusculas).select('id').first()
    assert.equal(linha?.id, existente.id)
  })
})
