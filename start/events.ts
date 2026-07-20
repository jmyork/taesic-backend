import emitter from '@adonisjs/core/services/emitter'
import EmpresaActivated from '#events/empresa_activated'
import EstoqueCritico from '#events/estoque_critico'
import LoteValidadeProxima from '#events/lote_validade_proxima'
import VendaCanceladaAltoValor from '#events/venda_cancelada_alto_valor'
import EstoqueRevertido from '#events/estoque_revertido'
import { onEmpresaActivated } from '#listeners/empresa_activated'
import {
  onEstoqueCritico,
  onLoteValidadeProxima,
  onVendaCanceladaAltoValor,
  onEstoqueRevertido,
} from '#listeners/estoque_alertas'

/**
 * Regista todos os listeners de eventos da aplicação. Corre no boot (preloads em
 * adonisrc.ts). Eventos baseados em classe (`emitter.on(Classe, listener)`) — não
 * precisam de ser registados em `EventsList`, ao contrário de eventos por nome de string.
 */

emitter.on(EmpresaActivated, onEmpresaActivated)
emitter.on(EstoqueCritico, onEstoqueCritico)
emitter.on(LoteValidadeProxima, onLoteValidadeProxima)
emitter.on(VendaCanceladaAltoValor, onVendaCanceladaAltoValor)
emitter.on(EstoqueRevertido, onEstoqueRevertido)
