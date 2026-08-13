import vine from '@vinejs/vine'

export const createuserposValidator = vine.compile(
  vine.object({
    user_id: vine
      .string()
      .trim()
      .escape()
      .uuid()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('user')
          .join('empresa', 'user.empresa_id', 'empresa.id')
          .where('empresa.company_alias', field.data.params?.company_alias)
          .where('user.id', value)
          .whereNull('user.deleted_at')
          .first()
        return !!exists
      })
      // NÃO há regra de unicidade em `user_id` sozinho: um utilizador pode estar em
      // vários POS. A regra real (o par user+pos não se repete) está em `pos_id`.
      ,
    pos_id: vine
      .string()
      .trim()
      .escape()
      .uuid()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('pos')
          .join('empresa', 'pos.empresa_id', 'empresa.id')
          .where('empresa.company_alias', field.data.params?.company_alias)
          .where('pos.id', value)
          .whereNull('pos.deleted_at')
          .first()
        return !!exists
      })
      /**
       * Só rejeita o MESMO PAR (utilizador + posto) já associado — que é exactamente o
       * que a base de dados garante desde `alter_userpos_permitir_multiplos`
       * (unique composta `user_id`+`pos_id`).
       *
       * Antes havia duas regras separadas, uma em `user_id` e outra em `pos_id`, cada
       * uma a rejeitar QUALQUER associação existente desse lado. Efeito prático: um
       * utilizador só podia pertencer a um posto, e — pior — assim que um posto tinha
       * um utilizador, mais ninguém podia ser lá colocado. Era o gémeo, na camada de
       * validação, da restrição de schema já corrigida; a BD passou a permitir N:N mas
       * o validator continuou a impor 1:1.
       */
      .unique(async (db, value, field) => {
        const userId = field.data.user_id
        if (!userId) return true // sem user_id, o erro é doutro campo

        const exists = await db
          .from('userpos')
          .join('pos', 'pos.id', 'userpos.pos_id')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params?.company_alias)
          .where('userpos.pos_id', value)
          .where('userpos.user_id', userId)
          .whereNull('userpos.deleted_at')
          .first()
        return !exists
      }),
  })
)

export const UserPosQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),

    user_id: vine.string().trim().escape().uuid().optional(),
    pos_id: vine.string().trim().escape().uuid().optional(),
    empresa_id: vine.string().trim().uuid().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
