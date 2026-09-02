/**
 * ── A identificação do SOFTWARE que emite o documento ────────────────────────
 *
 * O art.º 10.º n.º 1 alínea j) do Decreto Presidencial 71/25 manda constar da
 * factura, entre outras coisas:
 *
 *   «Identificação do software de facturação validado pela AGT utilizado para a
 *    emissão da factura, o código hash, [...] bem como o respectivo número da
 *    certificação ou validação.»
 *
 * O decreto **não fixa a redacção** — não exige a frase «Processado por programa
 * validado n.º X/AGT» nem nenhuma outra. Exige que os dados constem. É por isso
 * que o que sai daqui é uma identificação legível e não uma fórmula copiada de
 * outra jurisdição.
 *
 * O código hash fica de fora e é deliberado: não está implementado (ver
 * `factura.hash`, nulo enquanto a comunicação à AGT não estiver ligada), e
 * escrever um hash inventado num documento fiscal é pior do que não escrever
 * nenhum — quem o conferisse encontraria um valor que não corresponde a nada.
 *
 * ── Porque é que isto é GRAVADO no documento e não lido ao imprimir ──────────
 *
 * Porque a identificação pertence ao momento da emissão. A versão do software
 * muda, o número de validação pode ser reemitido — e uma factura de Março
 * reimpressa em Novembro tem de continuar a dizer com que programa foi feita,
 * não com qual está instalado hoje. É a mesma razão por que o nome e o NIF do
 * adquirente são copiados para a linha em vez de resolvidos por relação.
 */

/** O que identifica o programa, tal como o Blueprint da AGT o pede. */
export interface SoftwareDeFacturacao {
  nome: string
  versao: string
  /** Número de certificação/validação junto da AGT. Vazio enquanto não houver. */
  certificacao: string | null
}

/**
 * As três variáveis são as MESMAS que a integração com o Minfin usa
 * (`minfin-integration/configuracao.ts`) — de propósito: o número que vai no
 * documento impresso e o que vai na comunicação à AGT têm de ser o mesmo, e duas
 * fontes divergiriam sem nada a assinalar.
 *
 * A diferença é que ali a ausência é um erro de configuração que impede a
 * comunicação, e aqui **não pode impedir a emissão**: uma empresa que ainda não
 * tenha número de validação continua a ter de facturar. Por isso lê-se sem
 * rebentar, com o nome e a versão a terem valor por omissão.
 */
export function softwareDeFacturacao(): SoftwareDeFacturacao {
  const texto = (chave: string): string | null => {
    const valor = process.env[chave]?.trim()
    return valor ? valor : null
  }

  return {
    nome: texto('MINFIN_SOFTWARE_NOME') ?? 'Taesic',
    versao: texto('MINFIN_SOFTWARE_VERSAO') ?? '1.0.0',
    certificacao: texto('MINFIN_SOFTWARE_CERTIFICACAO'),
  }
}

/**
 * A linha que vai gravada em `factura.software_id` e impressa no documento.
 *
 * Com número de validação:  `Taesic v1.0.0 — Validação AGT n.º 123`
 * Sem número de validação:  `Taesic v1.0.0`
 *
 * A segunda forma não é um documento incompleto por descuido: é o que se pode
 * afirmar com verdade antes de a AGT atribuir o número. Escrever «n.º» seguido
 * de nada, ou de um valor de exemplo, seria pôr no documento uma afirmação
 * falsa sobre uma validação que não existe.
 */
export function identificacaoDoSoftware(
  software: SoftwareDeFacturacao = softwareDeFacturacao()
): string {
  const base = `${software.nome} v${software.versao}`
  return software.certificacao ? `${base} — Validação AGT n.º ${software.certificacao}` : base
}
