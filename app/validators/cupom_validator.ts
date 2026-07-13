import vine from '@vinejs/vine'

export const createcupomValidator = vine.compile(
  vine.object({
    // Só confirma que o promotor existe e não está eliminado — o cupomRepository.create() é
    // que garante que um promotor de domínio só recebe cupões na SUA própria empresa (a
    // verificação de pertença à empresa vive na camada de repositório, não no validador, para
    // seguir o mesmo padrão já usado no resto deste ficheiro de validadores).
    promotor_id: vine.string().trim().uuid().exists(async (db, value) => {
      const promotor = await db.from('promotor').where('id', value).whereNull('deleted_at').first()
      return !!promotor
    }),
    codigo: vine
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]+$/)
      .unique(async (db, value) => !(await db.from('cupom').where('codigo', value).first()))
      .optional(),
    desconto: vine.number().min(0).max(100),
    validade: vine.date({ formats: ['iso8601'] }).optional(),
  })
)

export const updatecupomValidator = vine.compile(
  vine.object({
    desconto: vine.number().min(0).max(100).optional(),
    validade: vine.date({ formats: ['iso8601'] }).optional(),
  })
)
