import vine from '@vinejs/vine'

/**
 * Unicidade dentro do espaço de nomes DA PLATAFORMA, não global.
 *
 * `papel.nome` deixou de ser único na tabela: cada empresa tem a sua cópia de
 * "Vendedor". Continuar a procurar em toda a tabela faria o dono da plataforma
 * ser impedido de criar um modelo só porque alguma empresa, algures, já usou
 * aquele nome — e passaria a impedir mais nomes a cada empresa que se registasse.
 *
 * `empresa_id IS NULL` é exactamente "plataforma ou modelo" (garantido pela CHECK
 * `papel_escopo_empresa_chk`), que é o universo que estas rotas governam. É um
 * pouco mais apertado do que a base de dados — que permitiria o mesmo nome como
 * modelo E como papel de plataforma, por terem `chave_escopo` diferentes — e essa
 * folga não vale a confusão de ter dois "Admin" no mesmo ecrã a significar coisas
 * diferentes.
 */
const nomeLivreNaPlataforma = async (db: any, value: string, field: any) => {
  const existing = await db.from('papel').whereNull('empresa_id').where('nome', value).first()
  return !existing || existing.id === field.meta?._id
}

export const createpapelValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .unique(async (db, value, field) => nomeLivreNaPlataforma(db, value, field)),
    descricao: vine.string().trim(),
  })
)

export const updatepapelValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .unique(async (db, value, field) => nomeLivreNaPlataforma(db, value, field))
      .optional(),
    descricao: vine.string().trim().optional(),
  })
)
