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
import { caixaFmt } from '@/app/caixa/caixaI18n'
import { useCarrinhoStore } from '@/stores/carrinhoStore'
import { raceWithScanAbort } from './webCaixaScanAbort'
import { avisoEstoqueCaixa, montarItemCarrinhoCaixa } from './montarItemCarrinhoCaixa'
import type { ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'

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
  /* Não existe gancho de "código sem match" aqui de propósito: o PDV não
   * cadastra produto. O ramo `nao_encontrado` abaixo informa e orienta via
   * `msg_produto_nao_encontrado_acao`, e para aí. */
  /**
   * Ambiguidade por nome/categoria com candidatos (Onda 2 · Bloco 1): em vez de
   * só um toast bloqueando a busca, o operador escolhe entre os candidatos.
   * `null` limpa a lista (nova tentativa de busca, sem ambiguidade anterior).
   * Ambiguidade por código de barras nunca chega aqui com candidatos — ver
   * `caixaCatalogo.impl.ts` (decisão de domínio produto↔loja/tenant pendente).
   */
  setCandidatosAmbiguos?: (payload: { mensagem: string; itens: ProdutoCaixaDTO[] } | null) => void
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
    return { ok: false, reason: 'validation', message: m.caixa.err_srv_codigo_vazio }
  }

  const source = ctx.scan.event.meta?.source
  if (source === 'scanner' && deps.setCaixaMensagemScannerInfo) {
    deps.setCaixaMensagemScannerInfo(caixaFmt(m.caixa.msg_codigo_lido, { codigo: trimmed }), { kind: 'info' })
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
    deps.setCandidatosAmbiguos?.(null)
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
      if (res.candidatos.length > 0 && deps.setCandidatosAmbiguos) {
        deps.setCandidatosAmbiguos({ mensagem: res.mensagem, itens: res.candidatos })
      } else {
        setCaixaMensagem(res.mensagem, { kind: 'warning' })
      }
      tocarFeedback('erro')
      return { ok: false, reason: 'ambiguous' }
    }

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const stale2 = staleCupomIfAny(ctx, deps)
    if (stale2) return stale2

    const p = res.produto
    const avisoEstoqueMsg = avisoEstoqueCaixa(p, m)

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
    // Preço já é autoritativo (calculado na ação unificada)
    const novoItem = montarItemCarrinhoCaixa(p, res.precoCalculado, res.tipoPrecoCalculado)
    const novaLinhaId = novoItem.id
    const abandonarLinhaDoScan = () => {
      if (!linhaPendenteRollback) return
      useCarrinhoStore.getState().removerItem(linhaPendenteRollback)
      linhaPendenteRollback = null
    }

    deps.adicionarItem(novoItem)
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
