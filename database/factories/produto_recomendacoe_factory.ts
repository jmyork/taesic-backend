import Factory from '@adonisjs/lucid/factories'
import { faker } from '@faker-js/faker'
import produto_recomendacoes from '#models/faturacao/produto_recomendacoes'

export const ProdutoRecomendacaoFactory = Factory.define(produto_recomendacoes, () => {
  return {
    recomendacao: faker.lorem.sentence(),
  }
}).build()
