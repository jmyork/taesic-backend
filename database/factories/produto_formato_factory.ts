import factory from '@adonisjs/lucid/factories'
import ProdutoFormato from '#models/faturacao/produto_formato'

export const ProdutoFormatoFactory = factory
  .define(ProdutoFormato, async ({ faker }) => {
    return {}
  })
  .build()
