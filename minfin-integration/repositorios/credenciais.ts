/**
 * De quem é a chave que assina esta factura?
 *
 * ── A lacuna que este ficheiro torna visível ──────────────────────────────────
 *
 * O Blueprint distingue duas chaves privadas, e a distinção é estrutural:
 *
 *   jwsSoftwareSignature  → chave do PRODUTOR de software. É nossa, é uma só,
 *                           e corresponde ao número de certificação do software.
 *   jwsDocumentSignature  → chave do EMISSOR, o contribuinte que factura.
 *   jwsSignature          → idem.
 *
 * Este backend é um SaaS multi-inquilino: cada `empresa` é um contribuinte
 * DIFERENTE, com o seu NIF e a sua chave. Uma única `MINFIN_CHAVE_EMISSOR` no
 * ambiente serve uma instalação de um só contribuinte — e assinaria as facturas
 * de todos os inquilinos com a chave de um deles.
 *
 * ── Porque é que isto não foi resolvido a adivinhar ───────────────────────────
 *
 * Porque guardar chaves privadas de terceiros exige decisões que não são
 * técnicas: onde ficam (coluna cifrada? KMS? HSM?), quem as pode ler, como se
 * rodam, e o que acontece quando uma expira a meio de um dia de facturação. E
 * exige saber COMO a AGT as entrega — o documento não diz.
 *
 * A alternativa a decidir isso sozinho seria assinar tudo com a chave do
 * ambiente. Isso não daria erro nenhum: produziria facturas sintacticamente
 * válidas, assinadas pela entidade errada, que a AGT recusaria com E08 — ou, pior,
 * aceitaria, atribuindo a facturação de uma empresa a outra.
 *
 * O que este ficheiro faz é impor a escolha: a resolução de credenciais é uma
 * interface, e a implementação por omissão RECUSA-SE a assinar em nome de um
 * contribuinte que não seja o configurado, com uma mensagem que diz exactamente
 * o que falta. Ver `README.md`, secção "Multi-inquilino: por decidir".
 */

import { configuracao as lerConfiguracao, type ConfiguracaoMinfin } from '../configuracao.js'

export interface Contribuinte {
  id: string
  nif: string
  nome: string
}

export interface ResolvedorDeCredenciais {
  /**
   * A configuração a usar para falar com a AGT em nome deste contribuinte.
   *
   * Lança se não puder resolver. Lançar é o correcto aqui, e é a excepção à
   * regra de `cliente_agt.ts` de não lançar por falhas de integração: isto não é
   * uma falha de operação, é uma configuração em falta — e continuar assinaria
   * com a chave errada.
   */
  resolver(contribuinte: Contribuinte): ConfiguracaoMinfin | Promise<ConfiguracaoMinfin>
}

export class CredenciaisIndisponiveis extends Error {
  constructor(
    readonly contribuinte: Contribuinte,
    motivo: string
  ) {
    super(
      `Não há credenciais de facturação electrónica para "${contribuinte.nome}" (NIF ${contribuinte.nif}): ${motivo}`
    )
    this.name = 'CredenciaisIndisponiveis'
  }
}

/**
 * A implementação por omissão: uma instalação, um contribuinte.
 *
 * Serve o caso em que este backend corre para uma empresa só — que é o único
 * caso que a configuração por variáveis de ambiente consegue descrever
 * honestamente. Para qualquer outro, recusa-se a assinar e diz porquê.
 */
export class CredenciaisDoAmbiente implements ResolvedorDeCredenciais {
  constructor(private readonly cfg?: ConfiguracaoMinfin) {}

  resolver(contribuinte: Contribuinte): ConfiguracaoMinfin {
    const cfg = this.cfg ?? lerConfiguracao()

    if (contribuinte.nif !== cfg.nif) {
      throw new CredenciaisIndisponiveis(
        contribuinte,
        `o ambiente está configurado para o NIF ${cfg.nif}. Uma instalação multi-inquilino ` +
          'precisa de um resolvedor de credenciais por empresa — ver ' +
          'minfin-integration/README.md, secção "Multi-inquilino: por decidir".'
      )
    }

    return cfg
  }
}

/**
 * Resolvedor explícito, por NIF. Para testes e para instalações com um número
 * pequeno e fixo de contribuintes, configurados no arranque.
 *
 * Não é a solução para o multi-inquilino a sério — mantém as chaves em memória
 * do processo — mas é honesto sobre o que é, e permite exercitar o caminho
 * multi-contribuinte sem esperar pela decisão de onde as chaves vão viver.
 */
export class CredenciaisPorNif implements ResolvedorDeCredenciais {
  constructor(private readonly porNif: Map<string, ConfiguracaoMinfin>) {}

  resolver(contribuinte: Contribuinte): ConfiguracaoMinfin {
    const cfg = this.porNif.get(contribuinte.nif)

    if (!cfg) {
      throw new CredenciaisIndisponiveis(
        contribuinte,
        `nenhuma configuração registada para este NIF (registados: ${[...this.porNif.keys()].join(', ') || 'nenhum'}).`
      )
    }

    return cfg
  }
}
