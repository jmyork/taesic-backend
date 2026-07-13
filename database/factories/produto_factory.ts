import Factory from '@adonisjs/lucid/factories'
import { faker } from '@faker-js/faker'
import produtos from '#models/faturacao/produtos'

export const ProdutoFactory = Factory.define(produtos, async () => {
  const isServico = faker.datatype.boolean()

  return {
    nome: isServico ? faker.company.catchPhrase() : faker.commerce.productName(),

    descricao: faker.commerce.productDescription(),

    fabricante_id: isServico ? null : null,
    formato_id: isServico ? null : null,
  }
}).build()
