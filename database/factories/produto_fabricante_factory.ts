import factory from '@adonisjs/lucid/factories'
import ProdutoFabricante from '#models/faturacao/produto_fabricante'

export const ProdutoFabricanteFactory = factory
  .define(ProdutoFabricante, async ({ faker }) => {
    return {}
  })
  .build()
