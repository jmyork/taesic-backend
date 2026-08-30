import vine from '@vinejs/vine'
import { pertenceAEmpresa } from './pertence_a_empresa.js'

export const createproduto_mediaValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produtos')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id') // ✅ Corrigido
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produtos.id', value)
          .first()
        return !!exists
      }),
    // Aceita tanto um único ficheiro (multipart/form-data com um só campo "media") como um
    // array de ficheiros — antes exigia sempre array, o que rejeitava um upload de uma
    // imagem só quando o cliente/browser não envolve o campo isolado em `[]`. `vine.
    // unionOfTypes` não suporta VineMultipartFile (falha em runtime: "schema type is not
    // compatible"), por isso usa-se `vine.union` com um `if` explícito por Array.isArray. O
    // repository (`produto_media_repository.create()`) já normalizava com
    // `Array.isArray(data.media) ? data.media : [data.media]`, só a validação bloqueava
    // antes de lá chegar. O limite de 30 por produto é aplicado no repository (soma o que
    // já está registado com o que vem neste pedido).
    media: vine.union([
      vine.union.if(
        (value) => Array.isArray(value),
        vine
          .array(
            vine.file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif', 'mkv', 'mp4', 'webm'] })
          )
          .minLength(1)
          .maxLength(10)
      ),
      vine.union.else(
        vine.file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif', 'mkv', 'mp4', 'webm'] })
      ),
    ]),
  })
)
export const updateproduto_mediaValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      // O validador de CREATE (acima) já cruzava com `empresa.company_alias`; o
      // de UPDATE não cruzava com nada. `PUT produto-medias/:id` com o
      // `produto_id` de outra empresa passava a validação e o `r.merge(data)` do
      // repositório gravava-o — a nossa imagem ficava pendurada no produto dela.
      // Este é o caso nomeado em CLAUDE.md §7.14 como ficando em aberto.
      .exists(pertenceAEmpresa({ tabela: 'produtos' }))
      .optional(),
    // REMOVIDO: `imagem_url`.
    //
    // Não era um campo a menos — era três defeitos sobrepostos:
    //
    // 1. `imagem_url` NÃO É COLUNA de `produto_media` (a coluna é `media`, ver
    //    app/models/faturacao/produto_media.ts). O `r.merge(data)` do repositório
    //    punha-a numa propriedade solta do objecto e nada era gravado. É a mesma
    //    classe de "coluna fantasma" que §7.14 varreu — este caso escapou porque
    //    vinha de um validador, não de um `@column()`.
    // 2. `file.move('uploads', ...)` escreve no disco LOCAL do servidor, não no
    //    R2 por onde todas as outras imagens passam (`moveToDisk` em
    //    produto_media_repository.create()). Não existe `uploads/` na raiz do
    //    projecto e nada serve esse caminho: o ficheiro era escrito e nunca mais
    //    lido por ninguém. Sobrava só o custo — 25 MB por pedido, sem limpeza,
    //    escritos por qualquer utilizador autenticado de qualquer empresa. É um
    //    caminho para encher o disco do servidor a partir de um `PUT`.
    // 3. O `.move()` é assíncrono e o `.transform()` do VineJS é síncrono: a
    //    promessa nunca era aguardada nem apanhada. Um erro de escrita
    //    desaparecia sem deixar rasto.
    //
    // Quem quiser mudar a imagem de um `produto_media` apaga e volta a criar,
    // que é o caminho que passa pelo R2 e grava a URL correcta.
  })
)

export const ProdutoImagemQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    empresa_id: vine.string().trim().uuid().optional(),
    produto_id: vine.string().trim().uuid().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
