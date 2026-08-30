import { test } from '@japa/runner'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import testUtils from '@adonisjs/core/services/test_utils'
import { MultipartFileFactory } from '@adonisjs/bodyparser/factories'
import drive from '@adonisjs/drive/services/main'
import ClienteRepository from '#repositories/cliente_repository'
import { createclienteValidator, updateclienteValidator } from '#validators/cliente_validator'
import { caminhoDoObjecto } from '../../app/helpers/imagem_r2.js'
import { createEmpresa } from '../helpers/fixtures.js'

const EXTNAMES = ['jpg', 'jpeg', 'png', 'gif']

/**
 * Um `MultipartFile` com um ficheiro DE VERDADE por trás.
 *
 * O `MultipartFileFactory` sozinho não chega: cria a instância mas não deixa
 * ficheiro nenhum no disco, e `moveToDisk()` começa por LER o `tmpPath`. Sem um
 * ficheiro real ali, o teste falharia no sítio errado — a dizer que o ficheiro
 * não existe, e não que o upload está mal.
 */
async function ficheiroDeImagem(conteudo = 'imagem-de-teste') {
  const pasta = await mkdtemp(join(tmpdir(), 'taesic-teste-'))
  const caminho = join(pasta, 'imagem.jpg')
  await writeFile(caminho, conteudo)

  const ficheiro = new MultipartFileFactory()
    .merge({ extname: 'jpg', size: conteudo.length, type: 'image', subtype: 'jpeg' })
    .create({ size: '25mb', extnames: EXTNAMES })

  ficheiro.tmpPath = caminho
  return ficheiro
}

/**
 * As imagens de cliente vão para o R2, e não para o disco do servidor.
 *
 * O QUE ESTES TESTES FIXAM. `cliente.logo` e `cliente.foto` eram escritos por um
 * `.transform()` DENTRO do validador, que chamava `file.move('uploads', ...)`:
 *
 *   - disco local em vez do R2, num caminho que nada serve (não existe sequer
 *     `uploads/` na raiz do projecto) — a funcionalidade estava partida de ponta
 *     a ponta e falhava em silêncio;
 *   - 25 MB por pedido, sem limpeza, escritos por qualquer utilizador
 *     autenticado — um caminho para encher o disco da VPS a partir de um `POST`,
 *     e com ele parar também a produção e a base de dados, que correm na mesma
 *     máquina;
 *   - `move()` é assíncrono e `.transform()` é síncrono: a promessa nunca era
 *     aguardada nem apanhada.
 *
 * Os testes usam `drive.fake('r2')` — os ficheiros ficam numa pasta temporária
 * em vez de irem para o bucket. Sem isto a suite precisaria de rede e de
 * credenciais verdadeiras, e um teste que falha por o R2 estar em baixo não diz
 * nada sobre o código.
 */
test.group('cliente — imagens no R2, não no disco do servidor', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * A correcção em si. Enquanto o `.transform()` lá estava, o payload validado
   * trazia uma STRING (o nome do ficheiro que ele acabara de escrever no disco).
   * Um `MultipartFile` à saída é a prova de que o validador deixou de escrever.
   */
  test('o validador entrega o FICHEIRO, já não uma string escrita no disco', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()

    const payload = await createclienteValidator.validate({
      tipo: 'Pessoa Física',
      nome: 'Cliente com foto',
      logo: await ficheiroDeImagem(),
      params: { company_alias: empresa.company_alias },
    })

    assert.isNotString(
      payload.logo,
      'uma string aqui significa que o `.transform()` voltou e que o validador está outra vez a escrever no disco'
    )
    assert.equal((payload.logo as any)?.extname, 'jpg')
  })

  test('create: sobe para o R2 e grava a URL pública, não um nome de ficheiro', async ({
    assert,
  }) => {
    const fake = drive.fake('r2')

    try {
      const empresa = await createEmpresa()
      const repo = new ClienteRepository()

      const cliente = await repo.create({
        tipo: 'Pessoa Física',
        nome: 'Cliente com logo',
        logo: await ficheiroDeImagem(),
        company_alias: empresa.company_alias,
      } as any)

      // O formato antigo era só `<uuid>.jpg`. O novo é uma URL absoluta.
      assert.match(cliente.logo, /^https?:\/\//, 'a coluna tem de guardar a URL pública')
      assert.include(cliente.logo, 'images/clientes/')
      assert.match(cliente.logo, /\.jpg$/)

      // O nome é imprevisível: o bucket é de leitura pública, e é a
      // imprevisibilidade do UUID que faz as vezes de controlo de acesso.
      const caminho = caminhoDoObjecto(cliente.logo)!
      assert.match(
        caminho,
        /^images\/clientes\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
        'o nome do objecto tem de ser um UUIDv4, nunca o nome que o utilizador enviou'
      )

      fake.assertExists(caminho)
    } finally {
      drive.restore('r2')
    }
  })

  test('update: substituir a imagem apaga o objecto anterior', async ({ assert }) => {
    const fake = drive.fake('r2')

    try {
      const empresa = await createEmpresa()
      const repo = new ClienteRepository()

      const cliente = await repo.create({
        tipo: 'Pessoa Física',
        nome: 'Cliente',
        logo: await ficheiroDeImagem('primeira'),
        company_alias: empresa.company_alias,
      } as any)

      const caminhoAntigo = caminhoDoObjecto(cliente.logo)!
      fake.assertExists(caminhoAntigo)

      const actualizado = await repo.update(
        cliente.id,
        { logo: await ficheiroDeImagem('segunda') } as any,
        empresa.company_alias
      )

      const caminhoNovo = caminhoDoObjecto(actualizado.logo)!
      assert.notEqual(caminhoNovo, caminhoAntigo)

      fake.assertExists(caminhoNovo)
      // Sem isto, cada edição de cliente deixava um objecto órfão no bucket,
      // para sempre e a pagar.
      fake.assertMissing(caminhoAntigo)
    } finally {
      drive.restore('r2')
    }
  })

  test('update que não menciona a imagem deixa-a como está', async ({ assert }) => {
    const fake = drive.fake('r2')

    try {
      const empresa = await createEmpresa()
      const repo = new ClienteRepository()

      const cliente = await repo.create({
        tipo: 'Pessoa Física',
        nome: 'Cliente',
        logo: await ficheiroDeImagem(),
        company_alias: empresa.company_alias,
      } as any)

      const caminho = caminhoDoObjecto(cliente.logo)!

      const actualizado = await repo.update(
        cliente.id,
        { nome: 'Nome novo' } as any,
        empresa.company_alias
      )

      assert.equal(actualizado.nome, 'Nome novo')
      assert.equal(actualizado.logo, cliente.logo, 'um update parcial não pode perder a imagem')
      fake.assertExists(caminho)
    } finally {
      drive.restore('r2')
    }
  })

  /**
   * Um alternador, não uma eliminação: a chamada seguinte repõe o cliente. Se as
   * imagens fossem apagadas aqui, repor devolvia uma ficha com as imagens
   * partidas — e sem nada a explicar porquê.
   */
  test('softDelete NÃO apaga as imagens, porque é reversível', async ({ assert }) => {
    const fake = drive.fake('r2')

    try {
      const empresa = await createEmpresa()
      const repo = new ClienteRepository()

      const cliente = await repo.create({
        tipo: 'Pessoa Física',
        nome: 'Cliente',
        logo: await ficheiroDeImagem(),
        company_alias: empresa.company_alias,
      } as any)

      const caminho = caminhoDoObjecto(cliente.logo)!

      await repo.softDelete(cliente.id, empresa.company_alias)
      fake.assertExists(caminho)

      // e ao repor, a imagem continua lá
      await repo.softDelete(cliente.id, empresa.company_alias)
      const reposto = await repo.findOrFail(cliente.id, empresa.company_alias)
      assert.isNull(reposto.deletedAt)
      fake.assertExists(caminho)
    } finally {
      drive.restore('r2')
    }
  })

  test('o validador de update também entrega o ficheiro', async ({ assert }) => {
    const empresa = await createEmpresa()

    const payload = await updateclienteValidator.validate({
      foto: await ficheiroDeImagem(),
      params: { company_alias: empresa.company_alias },
    })

    assert.isNotString(payload.foto)
  })
})

/**
 * A derivação URL → caminho do objecto. É a metade inversa de `urlPublicaR2()` e
 * as duas têm de concordar; é também o que decide o que se apaga do bucket, por
 * isso enganar-se aqui apaga o ficheiro errado — ou nenhum.
 */
test.group('caminhoDoObjecto', () => {
  test('extrai o caminho de uma URL de domínio público', ({ assert }) => {
    assert.equal(
      caminhoDoObjecto('https://cdn.exemplo.com/images/clientes/abc.jpg'),
      'images/clientes/abc.jpg'
    )
  })

  /**
   * Devolver `null` aqui é o que impede um `delete` às cegas. O formato antigo
   * gravado por `cliente.logo` era só `<uuid>.jpg` — sem URL, sem bucket. Tratá-lo
   * como um caminho mandaria apagar `<uuid>.jpg` na raiz do bucket, que não é o
   * objecto de ninguém mas também não é nada que devamos tocar.
   */
  test('devolve null para o formato antigo (só o nome do ficheiro)', ({ assert }) => {
    assert.isNull(caminhoDoObjecto('9f1c2b3a-0000-4000-8000-000000000000.jpg'))
  })

  test('devolve null para vazio, null e undefined', ({ assert }) => {
    assert.isNull(caminhoDoObjecto(''))
    assert.isNull(caminhoDoObjecto(null))
    assert.isNull(caminhoDoObjecto(undefined))
  })
})
