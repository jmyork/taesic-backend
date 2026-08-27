import vine from '@vinejs/vine'

/**
 * Escolher um plano.
 *
 * O `.exists()` verifica que o plano existe E está activo — um plano desactivado no
 * backoffice deixa de poder ser escolhido, mas as empresas que já o têm continuam nele
 * (é o repositório que decide isso, não este validador).
 *
 * `!!linha` e não `linha !== undefined`: `first()` devolve `null` quando não há linha, e
 * `null !== undefined` é `true` — o erro que já custou 33 regras a este projecto (7.14).
 */
export const escolherPlanoValidator = vine.compile(
  vine.object({
    plano_id: vine
      .string()
      .trim()
      .uuid()
      .exists(async (db, value) => {
        const linha = await db
          .from('plano')
          .where('id', value)
          .where('ativo', true)
          .whereNull('deleted_at')
          .first()
        return !!linha
      }),
  })
)
