import vine from '@vinejs/vine'
import { pertenceAEmpresa } from './pertence_a_empresa.js'

/**
 * `subscricao` liga-se a `empresa` pela coluna `cliente_id` — o nome engana, mas
 * o `@belongsTo` em app/models/subscricao.ts aponta mesmo para `Empresa`. Daí o
 * `chaveDaEmpresa` explícito: sem ele o helper procuraria `subscricao.empresa_id`,
 * que não existe, e a consulta rebentava em runtime em vez de validar.
 *
 * Sem isto, `POST api/:alias/cobranca` aceitava o `subscricao_id` de QUALQUER
 * empresa — emitir uma cobrança contra a subscrição de outra.
 */
const subscricaoDestaEmpresa = pertenceAEmpresa({
  tabela: 'subscricao',
  chaveDaEmpresa: 'subscricao.cliente_id',
})

export const createcobrancaValidator = vine.compile(
  vine.object({
    subscricao_id: vine
      .string()
      .trim()
      .escape()
      .exists(subscricaoDestaEmpresa),
    valor: vine.number().decimal([0, 12]),
    moeda: vine.string().trim().escape(),
    status: vine.string().trim().escape(),
    data_emissao: vine.date({ formats: ['iso8601'] }),
    data_vencimento: vine.date({ formats: ['iso8601'] }),
    pago: vine.boolean(),
    referencia: vine.string().trim().escape(),
  })
)
export const updatecobrancaValidator = vine.compile(
  vine.object({
    subscricao_id: vine
      .string()
      .trim()
      .escape()
      .exists(subscricaoDestaEmpresa)
      .optional(),
    valor: vine.number().decimal([0, 12]).optional(),
    moeda: vine.string().trim().escape().optional(),
    status: vine.string().trim().escape().optional(),
    data_emissao: vine.date({ formats: ['iso8601'] }).optional(),
    data_vencimento: vine.date({ formats: ['iso8601'] }).optional(),
    pago: vine.boolean().optional(),
    referencia: vine.string().trim().escape().optional(),
  })
)
