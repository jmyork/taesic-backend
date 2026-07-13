import vine from '@vinejs/vine'

export const AdonisSchemaVersionsCreateValidator = vine.compile(
  vine.object({
        version:vine.number()
  })
)

export const AdonisSchemaVersionsUpdateValidator =  vine.compile(
  vine.object({
        version:vine.number().optional()
  })
)
