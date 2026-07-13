import vine from '@vinejs/vine'
import ValidatorConstraint from '../helpers/Validator.js'

const fabricanteExistsValidator = new ValidatorConstraint({
  table: 'produto_fabricantes',
  column: 'nome',
  tenantColumn: 'empresa_id',
})
const formatoExistsValidator = new ValidatorConstraint({
  table: 'produto_formatos',
  column: 'nome',
  tenantColumn: 'empresa_id',
})

const fornecedorExistsValidator = new ValidatorConstraint({
  table: 'produto_fornecedores',
  column: 'nome',
  tenantColumn: 'empresa_id',
})

const marcaExistsValidator = new ValidatorConstraint({
  table: 'marcas',
  column: 'nome',
  tenantColumn: 'empresa_id',
})
// const uniqueNomeUpdate = new ValidatorConstraint({
//   table: 'produtos',
//   column: 'nome',
//   tenantColumn: 'empresa_id',
// }).updateRule()

// CREATE
export const createprodutosValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        try {
          // Verificar se company_alias existe
          const companyAlias = field.data.params?.company_alias

          if (!companyAlias) {
            console.error('company_alias não encontrado no contexto da validação')
            return false // Falha a validação
          }

          const exists = await db
            .from('produtos')
            .join('empresa', 'empresa.id', 'produtos.empresa_id')
            .where('empresa.company_alias', companyAlias)
            .where('produtos.nome', value)
            .whereNull('produtos.deleted_at') // ✅ Adicionar isso
            .first()

          return !exists
        } catch (error) {
          console.error('Erro na validação unique:', error)
          return false // Falha a validação em caso de erro
        }
      }),

    descricao: vine.string().trim().escape(), // ✅ Remover .trim() duplicado
    marca_id: vine.string().uuid().escape().exists(marcaExistsValidator.existsRule()).optional(),
    //.requiredWhen('is_service', '=', false)
    fornecedor_id: vine
      .string()
      .uuid()
      .escape()
      .exists(fornecedorExistsValidator.existsRule())
      .optional(),
    // .requiredWhen('is_service', '=', false)
    fabricante_id: vine
      .string()
      .uuid() // ✅ Deveria ser uuid?
      .escape()
      .exists(fabricanteExistsValidator.existsRule())
      .optional(),
    // .requiredWhen('is_service', '=', false)
    formato_id: vine
      .string()
      .uuid() // ✅ Deveria ser uuid?
      .escape()
      .exists(formatoExistsValidator.existsRule())
      .optional(),
    // .requiredWhen('is_service', '=', false)
    is_service: vine.boolean(),

    preco_compra: vine.number().decimal([0, 12]).optional(),
    preco_venda: vine.number().decimal([0, 12]).optional().requiredWhen("is_service", "=", true)
  })
)

// UPDATE
export const updateprodutosValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        try {
          // Verificar se company_alias existe
          const companyAlias = field.data.params?.company_alias

          if (!companyAlias) {
            console.error('company_alias não encontrado no contexto da validação')
            return false // Falha a validação
          }

          const exists = await db
            .from('produtos')
            .join('empresa', 'empresa.id', 'produtos.empresa_id')
            .where('empresa.company_alias', companyAlias)
            .where('produtos.nome', value)
            .whereNot('produtos.id', field?.meta.id)
            .whereNull('produtos.deleted_at') // ✅ Adicionar isso
            .first()

          return !exists
        } catch (error) {
          console.error('Erro na validação unique:', error)
          return false // Falha a validação em caso de erro
        }
      })
      .optional(),

    descricao: vine.string().trim().trim().escape().optional(),

    fabricante_id: vine
      .string()
      .trim()
      .escape()
      .exists(fabricanteExistsValidator.existsRule())
      .optional(),
    // .requiredIfExists('is_service')
    // .requiredWhen('is_service', '=', false)
    marca_id: vine.string().uuid().escape().exists(marcaExistsValidator.existsRule()).optional(),
    // .requiredWhen('is_service', '=', false)
    fornecedor_id: vine
      .string()
      .uuid()
      .escape()
      .exists(fornecedorExistsValidator.existsRule())
      .optional(),
    // .requiredWhen('is_service', '=', false)
    formato_id: vine
      .string()
      .uuid()
      .trim()
      .escape()
      .exists(formatoExistsValidator.existsRule())
      .optional(),
    // .requiredIfExists('is_service')
    // .requiredWhen('is_service', '=', false)
    is_service: vine.boolean().optional(),
    // preços de venda e de fornecimento/produção do produto.
    preco_compra: vine.number().decimal([0, 12]).optional(),
    preco_venda: vine.number().decimal([0, 12]).optional().requiredWhen("is_service", "=", true)
  })
)

export const CreateProdutoWithDetailsValidator = vine.compile(
  vine.object({
    produto: vine.object({
      nome: vine
        .string()
        .trim()
        .escape()
        .unique(
          new ValidatorConstraint({
            table: 'produtos',
            column: 'nome',
            tenantColumn: 'empresa_id',
          }).createRule()
        ),
      descricao: vine.string().trim().trim().escape().optional(),
      marca_id: vine
        .string()
        .uuid()
        .escape()
        .exists(
          new ValidatorConstraint({
            table: 'marcas',
            column: 'nome',
            tenantColumn: 'empresa_id',
          }).existsRule()
        )
        .optional(),
      fabricante_id: vine
        .string()
        .trim()
        .escape()
        .exists(fabricanteExistsValidator.existsRule())
        .optional()
        .requiredWhen('is_service', '=', false),
      formato_id: vine
        .string()
        .trim()
        .escape()
        .exists(formatoExistsValidator.existsRule())
        .optional()
        .requiredWhen('is_service', '=', false),
      is_service: vine.boolean(),
      fornecedor_id: vine
        .string()
        .uuid()
        .escape()
        .exists(
          new ValidatorConstraint({
            table: 'produto_fornecedores',
            column: 'nome',
            tenantColumn: 'empresa_id',
          }).existsRule()
        )
        .optional(),
    }),
    detalhes: vine
      .object({
        descricoes: vine
          .array(
            vine.object({
              propriedade: vine.string().trim().trim().escape(),
              descricao_detalhada: vine.string().trim().trim().escape(),
            })
          )
          .distinct(['propriedade', 'descricao_detalhada'])
          .optional(),

        categorias: vine
          .array(
            vine.object({
              produto_categoria_id: vine
                .string()
                .uuid()
                .exists(
                  new ValidatorConstraint({
                    table: 'produto_categorias',
                    column: 'id',
                  }).existsRule()
                ),
            })
          )
          .distinct('produto_categoria_id')
          .optional(),

        contraindicacoes: vine
          .array(
            vine.object({
              contraindicacao: vine.string().trim().trim().escape(),
            })
          )
          .distinct('contraindicacao')
          .optional(),

        recomendacoes: vine
          .array(
            vine.object({
              recomendacao: vine.string().trim().trim().escape(),
            })
          )
          .distinct('recomendacao')
          .optional(),
      })
      .optional(),
  })
)

export const ProdutoQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
    nome: vine.string().trim().escape().optional(),
    descricao: vine.string().trim().escape().optional(),
    empresa_id: vine.string().trim().uuid().optional(),
    fornecedor_id: vine.string().uuid().optional(),
    marca_id: vine.string().uuid().optional(),
    formato_id: vine.string().uuid().optional(),
    fabricante_id: vine.string().uuid().optional(),
    is_service: vine.boolean().optional(),
  })
)
