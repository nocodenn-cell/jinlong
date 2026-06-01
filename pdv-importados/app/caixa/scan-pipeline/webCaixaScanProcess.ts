import {
  normalizeHumanTelemetryPayload,
  type HumanTelemetryPayload,
  type ScanPipelineSink,
  type ScanProcessContext,
  type ScanProcessResult,
} from '../../../../shared-core/src/pdv/scan-pipeline'
import type { CarrinhoState } from '../../../../shared-core/src/stores/unifiedCartStore'
import { buscarProdutoComPrecoCaixa } from '@/app/caixa/actions'
import { createClient } from '@/lib/supabase/client'
import type { Mensagens } from '@/i18n/getMessages'
import type { CaixaToastKind } from '@/app/caixa/hooks/useCaixaMensagens'
import { useCarrinhoStore } from '@/stores/carrinhoStore'
import { raceWithScanAbort } from './webCaixaScanAbort'

type SetCaixaMensagemFn = (
  text: string | null,
  options?: { kind?: CaixaToastKind; toast?: boolean },
) => void

function telBase(ctx: ScanProcessContext): Pick<HumanTelemetryPayload, 'scanId' | 'sequenceNumber' | 'ctx'> {
  const meta = ctx.scan.event.meta
  const sid = meta?.cupomSessionId
  const corr = meta?.correlationId ?? sid
  return {
    scanId: ctx.scan.event.id,
    sequenceNumber: ctx.scan.sequenceNumber,
    ctx: {
      ...(sid != null && sid !== '' ? { cupomSessionId: sid } : {}),
      ...(corr != null && `${corr}` !== '' ? { correlationId: corr } : {}),
    },
  }
}

/** Scan com `cupomSessionId` no meta: exige igualdade com o cupom ativo (novo cupom gera novo id). */
function staleCupomIfAny(ctx: ScanProcessContext, deps: WebCaixaScanDeps): ScanProcessResult | null {
  const sid = ctx.scan.event.meta?.cupomSessionId
  if (sid == null || sid === '') return null
  if (sid !== deps.getActiveCupomSessionId()) {
    return { ok: false, reason: 'stale_cupom' }
  }
  return null
}

export type WebCaixaScanDeps = {
  m: Mensagens
  setCaixaMensagem: SetCaixaMensagemFn
  /** Opcional: toast “código lido” só para leitura por scanner. */
  setCaixaMensagemScannerInfo?: SetCaixaMensagemFn
  setCodigo: (v: string) => void
  tocarFeedback: (kind: 'ok' | 'erro') => void
  focarCampoBusca: () => void
  adicionarItem: CarrinhoState['adicionarItem']
  setCartOwnerForSession: CarrinhoState['setCartOwnerForSession']
  /** Sessão operacional do cupom (novo cupom ⇒ novo id); usado com `meta.cupomSessionId` no enqueue. */
  getActiveCupomSessionId: () => string
  /** Telemetria humana (runtime + adapter); injetada por `useCaixaScanPipeline`. */
  telemetry?: ScanPipelineSink
  /** Chamado após scan bem-sucedido — usado para dedupe (500ms) no nível do scanner. */
  onItemAdded?: (info: { codigo: string; itemId: string; produtoId: string }) => void
}

/**
 * Processa uma leitura já serializada pelo pipeline (PR 2B).
 */
export async function runWebCaixaScanProcess(
  ctx: ScanProcessContext,
  deps: WebCaixaScanDeps,
): Promise<ScanProcessResult> {
  const { m, setCaixaMensagem, setCodigo, tocarFeedback, focarCampoBusca } = deps
  const signal = ctx.signal
  /** Linha criada neste scan; rollback até commit explícito (P0 stale_cupom / abort). */
  let linhaPendenteRollback: string | null = null
  const trimmed = ctx.scan.event.codigo.trim().replace(/[^\x20-\x7E]/g, '')
  if (!trimmed) {
    return { ok: false, reason: 'validation', message: 'Código vazio.' }
  }

  const source = ctx.scan.event.meta?.source
  if (source === 'scanner' && deps.setCaixaMensagemScannerInfo) {
    deps.setCaixaMensagemScannerInfo(`Código lido: ${trimmed}`, { kind: 'info' })
  }
  if (signal?.aborted) {
    return { ok: false, reason: 'aborted' }
  }

  try {
    const stale0 = staleCupomIfAny(ctx, deps)
    if (stale0) return stale0
    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    setCaixaMensagem(null)
    const tBusca = Date.now()
    // Busca produto + calcula preço em 1 round-trip (elimina 2ª server action)
    const buscaR = await raceWithScanAbort(signal, () => buscarProdutoComPrecoCaixa(trimmed, 1))
    if (!buscaR.ok) {
      return { ok: false, reason: 'aborted' }
    }
    const res = buscaR.value
    const dtBusca = Date.now() - tBusca
    // Telemetria de busca unificada (produto + preço em 1 action)
    deps.telemetry?.emitTelemetry(
      normalizeHumanTelemetryPayload({
        ...telBase(ctx),
        event: 'buscar_produto_duration_ms',
        at: Date.now(),
        durationMs: dtBusca,
      }),
    )

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const stale1 = staleCupomIfAny(ctx, deps)
    if (stale1) return stale1

    if (!res.ok) {
      setCaixaMensagem(res.error, { kind: 'error' })
      tocarFeedback('erro')
      return { ok: false, reason: 'network', message: res.error }
    }

    if (res.status === 'nao_encontrado') {
      setCaixaMensagem(m.caixa.msg_produto_nao_encontrado_acao, { kind: 'warning' })
      tocarFeedback('erro')
      return { ok: false, reason: 'not_found' }
    }

    if (res.status === 'ambiguo') {
      setCaixaMensagem(res.mensagem, { kind: 'warning' })
      tocarFeedback('erro')
      return { ok: false, reason: 'ambiguous' }
    }

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const stale2 = staleCupomIfAny(ctx, deps)
    if (stale2) return stale2

    const p = res.produto
    const q = p.quantidade_estoque
    const min = p.estoque_minimo
    let avisoEstoqueMsg: string | null = null
    if (q !== null && q < 1) {
      avisoEstoqueMsg = `${m.caixa.item_adicionado} ${m.caixa.estoque_baixo}`
    } else if (q !== null && min !== null && q <= min) {
      avisoEstoqueMsg = `${m.caixa.item_adicionado} ${m.caixa.estoque_abaixo_minimo}`
    }

    const sessionR = await raceWithScanAbort(signal, async () => {
      const supabase = createClient()
      return supabase.auth.getSession()
    })
    if (!sessionR.ok) {
      return { ok: false, reason: 'aborted' }
    }
    const {
      data: { session },
    } = sessionR.value
    const uid = session?.user?.id ?? null
    if (uid) {
      deps.setCartOwnerForSession(uid)
    }

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const stale3 = staleCupomIfAny(ctx, deps)
    if (stale3) return stale3

    /**
     * Política P0: mutação do carrinho só é “confirmada” quando o scan termina com sucesso.
     * Qualquer abort / stale_cupom / falha de pricing após `adicionarItem` faz rollback da linha
     * deste bip (evita divergência invisível scan failed vs carrinho mutado).
     */
    const novaLinhaId = `${p.id}-${Date.now()}`
    const abandonarLinhaDoScan = () => {
      if (!linhaPendenteRollback) return
      useCarrinhoStore.getState().removerItem(linhaPendenteRollback)
      linhaPendenteRollback = null
    }

    // Preço já é autoritativo (calculado na ação unificada)
    deps.adicionarItem({
      id: novaLinhaId,
      produtoId: p.id,
      nome: p.nome,
      quantidade: 1,
      precoUnitario: res.precoCalculado,
      precoOriginal: res.precoCalculado,
      resultado: {
        precoUnitario: res.precoCalculado,
        precoOriginal: res.precoCalculado,
        descontoUnitario: 0,
        tipoPreco: res.tipoPrecoCalculado,
      },
      metaPdv: {
        origem: p.origem,
        tem_nf: p.tem_nf,
        observacao: p.observacao,
        estoque_atual: p.quantidade_estoque,
        estoque_minimo: p.estoque_minimo,
        categoriaId: p.categoria_id,
        precoAtacado: p.preco_atacado,
        precoVarejoReferencia: p.preco_varejo,
      },
    })
    linhaPendenteRollback = novaLinhaId

    if (signal?.aborted) {
      abandonarLinhaDoScan()
      return { ok: false, reason: 'aborted' }
    }

    const stale4 = staleCupomIfAny(ctx, deps)
    if (stale4) {
      abandonarLinhaDoScan()
      return stale4
    }

    // Item comprometido no carrinho — limpa o guard aqui para que o finally
    // não reverta. O bloco de UI abaixo tem try/catch próprio: falhas em
    // toast/telemetria/áudio retornam ok:true pois o item já foi adicionado.
    linhaPendenteRollback = null
    try {
      setCodigo('')
      if (avisoEstoqueMsg) {
        setCaixaMensagem(avisoEstoqueMsg, { kind: 'warning' })
      } else {
        setCaixaMensagem(m.caixa.msg_item_adicionado_toast, { kind: 'success' })
      }
      const ackAt = Date.now()
      deps.telemetry?.emitTelemetry(
        normalizeHumanTelemetryPayload({
          ...telBase(ctx),
          event: 'scan_to_visual_ack_ms',
          at: ackAt,
          durationMs: Math.max(0, ackAt - ctx.scan.event.receivedAt),
        }),
      )
      tocarFeedback('ok')
      deps.onItemAdded?.({ codigo: trimmed, itemId: novaLinhaId, produtoId: p.id })
    } catch {
      // Feedback secundário falhou mas o item já está no carrinho — ok.
    }
    return { ok: true }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, reason: 'aborted' }
    }
    setCaixaMensagem(m.caixa.falha_busca, { kind: 'error' })
    tocarFeedback('erro')
    return { ok: false, reason: 'unknown', message: m.caixa.falha_busca }
  } finally {
    if (linhaPendenteRollback != null && linhaPendenteRollback !== '') {
      useCarrinhoStore.getState().removerItem(linhaPendenteRollback)
      linhaPendenteRollback = null
    }
    focarCampoBusca()
  }
}
