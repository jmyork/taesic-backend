import { DateTime } from 'luxon'

/** Emitido por `estoque:check-alertas` para lotes com stock > 0 perto de (ou já passados de) validade. */
export default class LoteValidadeProxima {
  constructor(
    public readonly loteId: string,
    public readonly produtoNome: string,
    public readonly companyAlias: string,
    public readonly dataValidade: DateTime,
    /** Negativo quando o lote já expirou. */
    public readonly diasRestantes: number
  ) {}
}
