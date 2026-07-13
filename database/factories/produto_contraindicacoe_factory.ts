import Factory from '@adonisjs/lucid/factories'
import { faker } from '@faker-js/faker'
import produto_contraindicacoes from '#models/faturacao/produto_contraindicacoes'

export const ProdutoContraindicacaoFactory = Factory.define(produto_contraindicacoes, () => {
  return {
    contraindicacao: faker.lorem.sentence(),
  }
}).build()
