import vine from '@vinejs/vine'

export const AdonisSchemaCreateValidator = vine.compile(
  vine.object({
        name:vine.string().escape().trim().maxLength(255),
		batch:vine.number(),
		migration_time:vine.date().optional()
  })
)

export const AdonisSchemaUpdateValidator =  vine.compile(
  vine.object({
        name:vine.string().escape().trim().maxLength(255).optional(),
		batch:vine.number().optional(),
		migration_time:vine.date().optional()
  })
)
