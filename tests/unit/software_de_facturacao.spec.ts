import { test } from '@japa/runner'
import {
  identificacaoDoSoftware,
  softwareDeFacturacao,
} from '../../app/helpers/software_de_facturacao.js'

/**
 * O que vai gravado em `factura.software_id` e impresso no documento.
 *
 * O art.º 10.º n.º 1 j) do DP 71/25 manda constar a identificação do software
 * validado pela AGT e o número da certificação. O decreto NÃO fixa a redacção —
 * o que se guarda aqui é a decisão de o dizer com verdade nos dois estados: com
 * número de validação, e sem ele.
 */
test.group('identificação do software de facturação', () => {
  const guardadas = {
    nome: process.env.MINFIN_SOFTWARE_NOME,
    versao: process.env.MINFIN_SOFTWARE_VERSAO,
    certificacao: process.env.MINFIN_SOFTWARE_CERTIFICACAO,
  }

  const repor = () => {
    for (const [chave, valor] of [
      ['MINFIN_SOFTWARE_NOME', guardadas.nome],
      ['MINFIN_SOFTWARE_VERSAO', guardadas.versao],
      ['MINFIN_SOFTWARE_CERTIFICACAO', guardadas.certificacao],
    ] as const) {
      if (valor === undefined) delete process.env[chave]
      else process.env[chave] = valor
    }
  }

  test('com número de validação, di-lo por extenso', ({ assert, cleanup }) => {
    cleanup(repor)
    process.env.MINFIN_SOFTWARE_NOME = 'Taesic'
    process.env.MINFIN_SOFTWARE_VERSAO = '2.1.0'
    process.env.MINFIN_SOFTWARE_CERTIFICACAO = '123'

    assert.equal(identificacaoDoSoftware(), 'Taesic v2.1.0 — Validação AGT n.º 123')
  })

  /*
   * O caso que interessa mais, e o que se decidiu: sem número atribuído, o
   * documento diz o programa e a versão e CALA-SE sobre a validação. Escrever
   * «n.º» seguido de nada — ou de um valor de exemplo — punha no documento uma
   * afirmação falsa sobre uma validação que não existe.
   */
  test('sem número de validação, não inventa nenhum', ({ assert, cleanup }) => {
    cleanup(repor)
    process.env.MINFIN_SOFTWARE_NOME = 'Taesic'
    process.env.MINFIN_SOFTWARE_VERSAO = '2.1.0'
    delete process.env.MINFIN_SOFTWARE_CERTIFICACAO

    const linha = identificacaoDoSoftware()
    assert.equal(linha, 'Taesic v2.1.0')
    assert.notInclude(linha, 'n.º')
    assert.notInclude(linha, 'AGT')
  })

  /*
   * A ausência de configuração não pode impedir a emissão: uma empresa sem
   * número de validação continua a ter de facturar. Ao contrário da integração
   * com o Minfin, onde a mesma ausência é um erro de configuração.
   */
  test('sem configuração nenhuma, ainda identifica o programa', ({ assert, cleanup }) => {
    cleanup(repor)
    delete process.env.MINFIN_SOFTWARE_NOME
    delete process.env.MINFIN_SOFTWARE_VERSAO
    delete process.env.MINFIN_SOFTWARE_CERTIFICACAO

    const software = softwareDeFacturacao()
    assert.isNotEmpty(software.nome)
    assert.isNotEmpty(software.versao)
    assert.isNull(software.certificacao)
    assert.isNotEmpty(identificacaoDoSoftware())
  })

  test('espaços em branco na variável valem como ausência', ({ assert, cleanup }) => {
    cleanup(repor)
    process.env.MINFIN_SOFTWARE_CERTIFICACAO = '   '
    assert.isNull(softwareDeFacturacao().certificacao)
  })
})
