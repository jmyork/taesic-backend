import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import type { Database } from '@adonisjs/lucid/database'

/**
 * O par papel+permissão ainda não existe?
 *
 * Tinha três defeitos ao mesmo tempo, e o conjunto tornava `POST api/papel-permissao`
 * impossível de usar:
 *
 *  1. consultava `user_papel` — a tabela ERRADA. Perguntava se o utilizador X tem o
 *     papel Y para decidir se o papel Y já tem a permissão Z;
 *  2. `!(await db.from(...))` sem `.first()`: esperar por um query builder devolve um
 *     ARRAY, e um array vazio é truthy em JS, portanto `!` dava sempre `false` — ou
 *     seja, "não é único" — e a validação rejeitava SEMPRE, mesmo um par inteiramente
 *     novo;
 *  3. o `.exists()` ao lado usava `exists !== undefined`, e `.first()` devolve `null`
 *     (não `undefined`) quando não há linha — logo dava sempre `true`, e um id
 *     inexistente passava até rebentar na chave estrangeira, com 500 em vez de 400.
 *
 * NÃO filtra `deleted_at`, de propósito: a constraint `unique(papel_id, permissao_id)`
 * da base de dados também não filtra, portanto aceitar aqui um par com soft delete só
 * trocaria um 400 legível por um erro de chave duplicada. Repor uma associação
 * removida faz-se pelo comando `permissao:conceder`, que sabe revivê-la.
 */
const parNaoExiste = async (db: Database, _valor: string, field: FieldContext) => {
  const dados = field.data as { papel_id?: string; permissao_id?: string }
  if (!dados.papel_id || !dados.permissao_id) return true

  const linha = await db
    .from('papel_permissao')
    .where('papel_id', dados.papel_id)
    .where('permissao_id', dados.permissao_id)
    .select('id')
    .first()

  return !linha
}
export const createpapel_permissaoValidator = vine.compile(
  vine.object({
    papel_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('papel').where('id', value).first()
        return !!exists
      })
      .unique(parNaoExiste),
    permissao_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('permissao').where('id', value).first()
        return !!exists
      })
      .unique(parNaoExiste),
  })
)
// export const updatepapel_permissaoValidator = vine.compile(
//   vine.object({
//     papel_id: vine.string().trim().exists(async (db, value, __) => {
//       const exists = await db.from('papel').where('id', value).first()
//       return exists !== undefined
//     }).optional(),
//     permissao_id: vine.string().trim().exists(async (db, value, __) => {
//       const exists = await db.from('permissao').where('id', value).first()
//       return exists !== undefined
//     }).optional(),
//   })
// )
