import Factory from '@adonisjs/lucid/factories'
import { faker } from '@faker-js/faker'
import produto_descricao from '#models/faturacao/faturacao/produto_descricao'

export const ProdutoDescricaoFactory = Factory.define(produto_descricao, () => {
  return {
    descricao_detalhada: faker.lorem.paragraphs(3),
  }
}).build()
