import vine from '@vinejs/vine'

export const CreateDomainUserPapelValidator = vine.compile(
  vine.object({
    user_id: vine.string().trim().uuid(),
    papel_id: vine.string().trim().uuid(),
  })
)

export const DomainUserPapelQueryValidator = vine.compile(
  vine.object({
    page: vine.number().optional(),
    limit: vine.number().optional(),
  })
)
