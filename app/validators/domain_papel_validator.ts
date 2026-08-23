import vine from '@vinejs/vine'

/**
 * O nome do papel é escrito por uma pessoa e aparece em ecrãs de gestão e em
 * registos de auditoria. `escape()` pela mesma razão que nos outros recursos.
 *
 * A recusa do prefixo `Platform_` NÃO vive aqui — vive no repositório
 * (`nomeDePapelReservado`). Uma fronteira de acesso que depende de um validador
 * HTTP fica por aplicar assim que alguém chame o repositório directamente, e este
 * projecto já foi mordido por isso (ver `venda_itens_repository.create()`). O
 * validador cobre a forma; o repositório cobre a regra.
 */
const nome = vine.string().trim().escape().minLength(2).maxLength(80)
const descricao = vine.string().trim().escape().maxLength(255).optional()

/**
 * As permissões vêm pelo NOME, não pelo id.
 *
 * O nome de uma permissão é o nome de uma rota (`domain_produtos.store`) — é
 * estável, legível e é o que aparece em toda a documentação e nos comandos ace.
 * Ids de permissões não significam nada para quem constrói o pedido, e obrigariam
 * o frontend a manter um mapa que já existe no catálogo.
 */
const permissoes = vine.array(vine.string().trim().maxLength(120)).distinct().optional()

export const CreateDomainPapelValidator = vine.compile(
  vine.object({
    nome,
    descricao,
    permissoes,
  })
)

export const UpdateDomainPapelValidator = vine.compile(
  vine.object({
    nome: nome.optional(),
    descricao,
    permissoes,
  })
)

export const DomainPapelQueryValidator = vine.compile(
  vine.object({
    page: vine.number().optional(),
    limit: vine.number().optional(),
    nome: vine.string().trim().optional(),
    deleted: vine.enum(['all', 'deleted']).optional(),
  })
)
