import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { defineConfig, services } from '@adonisjs/drive'

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK'),

  // NÃO APAGAR. Sem esta chave, `drive.fake('r2')` rebenta — e é ela que permite
  // aos testes exercitar uploads sem falar com o R2 a sério (ver
  // tests/functional/cliente_imagens_r2.spec.ts). Só é lida quando `fake()` é
  // chamado, portanto em produção não tem efeito nenhum.
  fakes: {
    location: app.tmpPath('drive-fakes'),
  },

  services: {
    r2: services.s3({
      credentials: {
        accessKeyId: env.get('R2_KEY'),
        secretAccessKey: env.get('R2_SECRET'),
      },
      region: 'auto',
      bucket: env.get('R2_BUCKET'),
      endpoint: env.get('R2_ENDPOINT'),
      visibility: 'public',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
