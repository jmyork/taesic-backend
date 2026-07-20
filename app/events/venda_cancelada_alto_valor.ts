/** Emitido quando uma venda ainda aberta é cancelada com um total acumulado acima do limiar configurado. */
export default class VendaCanceladaAltoValor {
  constructor(
    public readonly vendaId: string,
    public readonly companyAlias: string,
    public readonly total: number,
    public readonly limiar: number
  ) {}
}
