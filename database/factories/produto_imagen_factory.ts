import Factory from '@adonisjs/lucid/factories'
import { faker } from '@faker-js/faker'
import produto_media from '#models/faturacao/produto_media'

export const ProdutoImagemFactory = Factory.define(produto_media, () => {
  return {
    imagem_url: faker.image.urlPicsumPhotos(),
  }
}).build()
