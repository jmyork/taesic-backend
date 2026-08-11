import { BaseSchema } from '@adonisjs/lucid/schema'

// Adiciona 'proforma' ao enum de vendas.status — uma proforma é uma venda real (mesma
// tabela, mesmo isolamento por tenant via caixa->pos->empresa) para ter histórico
// persistido, mas nunca passa por close() (sem pagamento/consumo de stock) e nunca
// bloqueia UserHasAnOpenVendaException (esse check só considera status 'aberta').
export default class extends BaseSchema {
  protected tableName = 'vendas'

  async up() {
    this.schema.raw(
      "ALTER TABLE `vendas` MODIFY COLUMN `status` ENUM('aberta','fechada','cancelada','reembolsada','proforma') NOT NULL DEFAULT 'aberta'"
    )
  }

  async down() {
    this.schema.raw(
      "ALTER TABLE `vendas` MODIFY COLUMN `status` ENUM('aberta','fechada','cancelada','reembolsada') NOT NULL DEFAULT 'aberta'"
    )
  }
}
