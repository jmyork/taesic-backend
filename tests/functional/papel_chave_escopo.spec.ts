import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import { clonarPapeisPadrao } from '../../app/helpers/papeis_da_empresa.js'
import { createEmpresa } from '../helpers/fixtures.js'

/**
 * `papel.chave_escopo` — a coluna que sustenta o índice único dos três âmbitos.
 *
 * Deixou de ser uma coluna GERADA e passou a ser uma coluna normal mantida por
 * dois gatilhos (`papel_chave_escopo_bi`/`_bu`). A troca foi forçada por
 * produção: o motor do servidor aceita a coluna gerada mas recusa indexá-la
 * ("Function or expression 'coalesce(...)' cannot be used in the GENERATED
 * ALWAYS AS clause"), e o deploy parou aí. Ver a migração
 * `..._796_alter_papel_chave_escopo_sem_coluna_gerada`.
 *
 * O que se perdeu na troca foi a garantia do motor de que a coluna NUNCA pode
 * estar errada. Um gatilho dá quase o mesmo — cobre todos os caminhos de escrita,
 * incluindo os que não passam pelo Lucid — mas é uma coisa que alguém pode largar
 * sem reparar. **Estes testes são o que substitui essa garantia**, e é por isso
 * que um deles varre a tabela inteira em vez de olhar só para o que criou.
 */
test.group('papel — chave_escopo', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function chaveDe(papelId: string) {
    const linha = await db.from('papel').where('id', papelId).select('chave_escopo').first()
    return linha?.chave_escopo as string | undefined
  }

  test('um papel de empresa fica com a chave igual ao empresa_id', async ({ assert }) => {
    const empresa = await createEmpresa()

    const papel = await Papel.create({
      nome: `Vendedor ${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      empresa_id: empresa.id,
      escopo: ESCOPO_PAPEL.empresa,
    })

    assert.equal(await chaveDe(papel.id), empresa.id)
  })

  test('um papel sem empresa fica com a chave igual ao escopo', async ({ assert }) => {
    const plataforma = await Papel.create({
      nome: `Platform_Teste_${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      empresa_id: null,
      escopo: ESCOPO_PAPEL.plataforma,
    })
    const modelo = await Papel.create({
      nome: `Modelo_Teste_${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      empresa_id: null,
      escopo: ESCOPO_PAPEL.modelo,
    })

    assert.equal(await chaveDe(plataforma.id), 'plataforma')
    assert.equal(await chaveDe(modelo.id), 'modelo')
  })

  test('mudar a empresa de um papel actualiza a chave', async ({ assert }) => {
    // O gatilho BEFORE UPDATE. Sem ele, a chave ficava presa ao valor da inserção
    // e o índice passava a proteger uma empresa que já não é a dona do papel.
    const primeira = await createEmpresa()
    const segunda = await createEmpresa()

    const papel = await Papel.create({
      nome: `Movido ${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      empresa_id: primeira.id,
      escopo: ESCOPO_PAPEL.empresa,
    })
    assert.equal(await chaveDe(papel.id), primeira.id)

    papel.empresa_id = segunda.id
    await papel.save()

    assert.equal(await chaveDe(papel.id), segunda.id)
  })

  test('uma escrita em bruto, sem passar pelo model, também fica com a chave certa', async ({
    assert,
  }) => {
    // É por isto que é gatilho e não `@beforeSave`. A migração 792 insere papéis
    // com `multiInsert`, os seeders escrevem directamente, e o outro backend tem o
    // seu próprio model — nenhum desses caminhos passa por um hook deste projecto.
    const empresa = await createEmpresa()
    const id = randomUUID()
    const agora = new Date()

    await db.table('papel').multiInsert([
      {
        id,
        nome: `Bruto ${randomUUID().slice(0, 8)}`,
        descricao: 'teste',
        empresa_id: empresa.id,
        escopo: 'empresa',
        created_at: agora,
        updated_at: agora,
      },
    ])

    assert.equal(await chaveDe(id), empresa.id)
  })

  test('o índice único recusa dois papéis com o mesmo nome no mesmo âmbito', async ({ assert }) => {
    const empresa = await createEmpresa()
    const nome = `Repetido ${randomUUID().slice(0, 8)}`

    await Papel.create({
      nome,
      descricao: 'teste',
      empresa_id: empresa.id,
      escopo: ESCOPO_PAPEL.empresa,
    })

    await assert.rejects(() =>
      Papel.create({
        nome,
        descricao: 'teste',
        empresa_id: empresa.id,
        escopo: ESCOPO_PAPEL.empresa,
      })
    )
  })

  test('duas empresas podem ter, cada uma, o seu papel com o mesmo nome', async ({ assert }) => {
    // O contrário do teste anterior, e a razão de ser de toda esta coluna: era
    // isto que a unicidade GLOBAL de `papel.nome` impedia.
    const primeira = await createEmpresa()
    const segunda = await createEmpresa()
    const nome = `Vendedor ${randomUUID().slice(0, 8)}`

    const a = await Papel.create({
      nome,
      descricao: 'teste',
      empresa_id: primeira.id,
      escopo: ESCOPO_PAPEL.empresa,
    })
    const b = await Papel.create({
      nome,
      descricao: 'teste',
      empresa_id: segunda.id,
      escopo: ESCOPO_PAPEL.empresa,
    })

    assert.notEqual(await chaveDe(a.id), await chaveDe(b.id))
  })

  test('nenhuma linha da tabela está dessincronizada', async ({ assert }) => {
    // A varredura. Se algum caminho de escrita contornar os gatilhos — porque
    // alguém os largou numa migração, ou porque uma restauração de backup os
    // perdeu —, é aqui que se vê, e não num 500 meses depois.
    const [fora] = await db.rawQuery(
      `SELECT id, nome, chave_escopo, empresa_id, escopo
         FROM papel
        WHERE NOT (chave_escopo <=> COALESCE(empresa_id, escopo))`
    )

    assert.deepEqual(
      fora as unknown[],
      [],
      'há papéis cuja chave_escopo não corresponde a COALESCE(empresa_id, escopo)'
    )
  })

  test('os dois gatilhos existem', async ({ assert }) => {
    const [linhas] = await db.rawQuery(
      `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
          AND TRIGGER_NAME IN ('papel_chave_escopo_bi', 'papel_chave_escopo_bu')`
    )

    const nomes = (linhas as { TRIGGER_NAME: string }[]).map((l) => l.TRIGGER_NAME).sort()
    assert.deepEqual(nomes, ['papel_chave_escopo_bi', 'papel_chave_escopo_bu'])
  })

  test('chave_escopo é uma coluna normal, não gerada', async ({ assert }) => {
    // O que o servidor recusou indexar. Se alguém a reintroduzir como gerada, o
    // deploy volta a parar — e o sítio para descobrir isso é aqui, não lá.
    const [linhas] = await db.rawQuery(
      `SELECT EXTRA, IS_NULLABLE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'papel'
          AND COLUMN_NAME = 'chave_escopo'`
    )

    const coluna = (linhas as { EXTRA: string; IS_NULLABLE: string }[])[0]
    assert.isDefined(coluna, 'a coluna chave_escopo tem de existir')
    assert.notInclude(coluna.EXTRA.toUpperCase(), 'GENERATED')
  })

  test('chave_escopo é ANULÁVEL, e tem de continuar a ser', async ({ assert }) => {
    // Isto era `assert.equal(coluna.IS_NULLABLE, 'NO')`. Mudou de lado, e a razão
    // é uma paragem em produção, não uma preferência.
    //
    // Com `NOT NULL` e sem valor por omissão, um servidor onde os gatilhos não
    // cheguem a ser criados fica com a tabela `papel` só de leitura:
    //
    //     ER_NO_DEFAULT_FOR_FIELD — Field 'chave_escopo' doesn't have a default value
    //
    // Foi o que aconteceu em `api-qua`, e o que impediu criar empresas lá. A regra
    // que fica: um campo novo tem de ter valor por omissão ou ser opcional, e uma
    // coluna derivada — de arrumação interna — nunca pode ser o motivo de uma
    // escrita de negócio falhar. Ver a migração
    // `..._798_alter_papel_chave_escopo_anulavel`.
    const [linhas] = await db.rawQuery(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'papel'
          AND COLUMN_NAME = 'chave_escopo'`
    )

    assert.equal(
      (linhas as { IS_NULLABLE: string }[])[0]?.IS_NULLABLE,
      'YES',
      'pôr chave_escopo NOT NULL volta a deixar a tabela papel só de leitura onde os gatilhos faltem'
    )
  })
})

/**
 * O MESMO, MAS SEM GATILHOS — a situação exacta de `api-qua`.
 *
 * O grupo de cima corre com os gatilhos no sítio, e por isso não distingue "a
 * aplicação preenche a chave" de "o gatilho preenche a chave": passava na mesma se
 * a aplicação não fizesse nada. Era essa a lacuna de cobertura que deixou o
 * problema chegar a produção — os testes passavam em dev, onde os gatilhos existem.
 *
 * Aqui os gatilhos são largados antes dos testes e repostos no fim. O que resta a
 * preencher `chave_escopo` é só o que a aplicação faz por si: o `@beforeSave` do
 * model e o valor escrito à mão no `multiInsert` de `papeis_da_empresa.ts`.
 */
test.group('papel — chave_escopo sem os gatilhos (o estado de api-qua)', (group) => {
  // DDL fora da transacção de cada teste, de propósito: no MySQL um CREATE/DROP
  // TRIGGER faz commit implícito, e dentro da transacção global levaria o
  // isolamento do teste à frente.
  group.setup(async () => {
    await db.rawQuery('DROP TRIGGER IF EXISTS papel_chave_escopo_bi')
    await db.rawQuery('DROP TRIGGER IF EXISTS papel_chave_escopo_bu')

    return async () => {
      await db.rawQuery(
        `CREATE TRIGGER papel_chave_escopo_bi BEFORE INSERT ON papel
           FOR EACH ROW SET NEW.chave_escopo = COALESCE(NEW.empresa_id, NEW.escopo)`
      )
      await db.rawQuery(
        `CREATE TRIGGER papel_chave_escopo_bu BEFORE UPDATE ON papel
           FOR EACH ROW SET NEW.chave_escopo = COALESCE(NEW.empresa_id, NEW.escopo)`
      )
    }
  })

  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function chaveDe(papelId: string) {
    const linha = await db.from('papel').where('id', papelId).select('chave_escopo').first()
    return linha?.chave_escopo as string | undefined
  }

  test('criar uma empresa clona os papéis padrão — era isto que rebentava', async ({ assert }) => {
    // O caminho exacto do erro em produção: `clonarPapeisPadrao` faz um
    // `multiInsert` que não passa pelo model. Sem gatilho e com a coluna NOT NULL,
    // este insert devolvia ER_NO_DEFAULT_FOR_FIELD e a empresa não chegava a ficar
    // utilizável.
    const empresa = await createEmpresa({ comPapeis: false })

    const clonados = await clonarPapeisPadrao(empresa.id)
    assert.isAbove(clonados, 0, 'tem de clonar pelo menos um papel padrão')

    const papeis = await db
      .from('papel')
      .where('empresa_id', empresa.id)
      .select('id', 'nome', 'chave_escopo')

    assert.isAbove(papeis.length, 0)
    for (const papel of papeis) {
      assert.equal(
        papel.chave_escopo,
        empresa.id,
        `o papel "${papel.nome}" ficou com a chave errada sem o gatilho`
      )
    }
  })

  test('Papel.create preenche a chave sem gatilho nenhum', async ({ assert }) => {
    const empresa = await createEmpresa({ comPapeis: false })

    const papel = await Papel.create({
      nome: `SemGatilho ${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      empresa_id: empresa.id,
      escopo: ESCOPO_PAPEL.empresa,
    })

    assert.equal(await chaveDe(papel.id), empresa.id)
  })

  test('um papel sem empresa também, e pelo escopo', async ({ assert }) => {
    const modelo = await Papel.create({
      nome: `ModeloSemGatilho ${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      empresa_id: null,
      escopo: ESCOPO_PAPEL.modelo,
    })

    assert.equal(await chaveDe(modelo.id), 'modelo')
  })

  test('mudar a empresa actualiza a chave sem o gatilho BEFORE UPDATE', async ({ assert }) => {
    // O `@beforeSave` corre em criação E em actualização — é o que substitui o
    // segundo gatilho. Sem isto, a chave ficava presa à empresa antiga e a linha
    // ficava no sítio errado do índice único.
    const primeira = await createEmpresa({ comPapeis: false })
    const segunda = await createEmpresa({ comPapeis: false })

    const papel = await Papel.create({
      nome: `MovidoSemGatilho ${randomUUID().slice(0, 8)}`,
      descricao: 'teste',
      empresa_id: primeira.id,
      escopo: ESCOPO_PAPEL.empresa,
    })

    papel.empresa_id = segunda.id
    await papel.save()

    assert.equal(await chaveDe(papel.id), segunda.id)
  })

  test('sem gatilho e sem model, a escrita PASSA — deixa é a chave por preencher', async ({
    assert,
  }) => {
    // Quem escreve por fora (o taesic-backoffice-api, SQL à mão) já não tem quem
    // lhe preencha a chave. O ponto deste teste é que isso é um NULL visível numa
    // consulta, e não uma escrita recusada: era a escrita recusada que parava a
    // plataforma. A coluna anulável é o que faz esta diferença.
    const empresa = await createEmpresa({ comPapeis: false })
    const id = randomUUID()
    const agora = new Date()

    await db.table('papel').multiInsert([
      {
        id,
        nome: `BrutoSemGatilho ${randomUUID().slice(0, 8)}`,
        descricao: 'teste',
        empresa_id: empresa.id,
        escopo: 'empresa',
        created_at: agora,
        updated_at: agora,
      },
    ])

    assert.isNotOk(await chaveDe(id))
  })
})
