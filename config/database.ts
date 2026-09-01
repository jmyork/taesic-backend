import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'mysql',
  connections: {
    mysql: {
      client: 'mysql2',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
      },
      migrations: {
        naturalSort: true,
        /**
         * O segundo caminho é a integração com a facturação electrónica da AGT.
         *
         * As migrações desse módulo vivem com ele (`minfin-integration/migrations`)
         * e não aqui, para o módulo inteiro caber numa pasta só — mas o dono do
         * esquema continua a ser este projecto (regra 7.18), e por isso é este
         * ficheiro que as regista. Com `naturalSort`, o Lucid ordena os dois
         * caminhos em conjunto: os prefixos `1800...` correm depois dos `179...`
         * já existentes.
         */
        paths: ['database/migrations', 'minfin-integration/migrations'],
      },
    },
  },
})

export default dbConfig
