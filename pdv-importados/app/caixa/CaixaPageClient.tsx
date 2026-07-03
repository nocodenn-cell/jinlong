"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useShallow } from "zustand/react/shallow"
import { useCarrinhoStore, type ItemCarrinhoComPreco } from "@/stores/carrinhoStore"
import { useHasMounted } from "@/hooks/useHasMounted"
import {
  finalizarVendaCaixa,
  abrirCaixaOperador,
  fecharCaixaOperador,
  validarGerenteDesconto,
} from "@/app/caixa/actions"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import { roundMoney2, type FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import {
  buildCheckoutSnapshot,
  validateCheckoutSnapshot,
} from "@shared-core/src/caixa/checkoutSnapshot"
import { aplicarDescontoGerenteSobreTotal } from "@/stores/managerDiscount"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { useCaixaMensagens } from "@/app/caixa/hooks/useCaixaMensagens"
import { useCaixaPagamentos } from "@/app/caixa/hooks/useCaixaPagamentos"
import {
  isCaixaAberto,
  useCaixaStatusMovimentacoes,
} from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { useCaixaBootstrapData } from "@/app/caixa/hooks/useCaixaBootstrapData"
import { useCaixaKeyboardShortcuts } from "@/app/caixa/hooks/useCaixaKeyboardShortcuts"
import { useCaixaGerenteTokenExpiry } from "@/app/caixa/hooks/useCaixaGerenteTokenExpiry"
import { useCaixaLayoutPreference } from "@/app/caixa/hooks/useCaixaLayoutPreference"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"
import { CaixaHeader } from "@/app/caixa/CaixaHeader"
import { CaixaSearchBar } from "@/app/caixa/CaixaSearchBar"
import { CaixaOperadorContextBar } from "@/app/caixa/CaixaOperadorContextBar"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import { CaixaFooter } from "@/app/caixa/CaixaFooter"
import { CaixaPdvCartSaleBar } from "@/app/caixa/CaixaPdvCartSaleBar"
import { CaixaPdvOperacoesButtons } from "@/app/caixa/CaixaPdvOperacoesButtons"
import { CaixaRailTurnoSummary } from "@/app/caixa/CaixaRailTurnoSummary"
import {
  CaixaGerenteModal,
  type ValidarSenhaGerenteResult,
} from "@/app/caixa/CaixaGerenteModal"
import { CaixaMovimentacaoModal } from "@/app/caixa/CaixaMovimentacaoModal"
import type { TipoMovimentacaoUi } from "@/app/caixa/caixaMovimentacaoTypes"
import { CaixaMovimentacaoAcaoModal } from "@/app/caixa/CaixaMovimentacaoAcaoModal"
import type { AcaoMovimentacaoTipo } from "@/app/caixa/caixaMovimentacaoTypes"
import { CaixaMovimentacoesTimeline } from "@/app/caixa/CaixaMovimentacoesTimeline"
import { CaixaMessageBanner } from "@/components/caixa/CaixaMessageBanner"
import { CaixaToastViewport } from "@/components/caixa/CaixaToastViewport"
import { CaixaValorNumericoModal } from "@/components/caixa/CaixaValorNumericoModal"
import { CaixaMotivoMinModal } from "@/components/caixa/CaixaMotivoMinModal"
import { CaixaConfirmModal } from "@/app/caixa/CaixaConfirmModal"
import { useScannerDetector } from "@/hooks/useScannerDetector"
import { useCaixaScanPipeline } from "@/app/caixa/scan-pipeline/useCaixaScanPipeline"
import { useThermalPrinter } from "@/hooks/useThermalPrinter"
import { CaixaReciboModal, type ReciboVenda } from "@/app/caixa/CaixaReciboModal"
import { CaixaScanPipelineDevPanel } from "@/app/caixa/scan-pipeline/CaixaScanPipelineDevPanel"
import { CaixaPdvLayoutPreviewBanner } from "@/app/caixa/CaixaPdvLayoutPreviewBanner"
import { CaixaPdvMetodoPagamentoSelector } from "@/app/caixa/CaixaPdvMetodoPagamentoSelector"
import {
  metodoPagamentoToForma,
  type MetodoPagamentoUi,
} from "@/app/caixa/caixaMetodoPagamento"
import {
  CaixaPdvOperadorTabs,
  type CaixaPdvOperadorTabId,
} from "@/app/caixa/CaixaPdvOperadorTabs"
import { cn } from "@/lib/utils"
import "@/styles/theme-oriental.css"

/** Banner «PDV clássico» em /caixa: oculto em produção salvo `NEXT_PUBLIC_CAIXA_PDV_LAYOUT_PREVIEW_BANNER=1`; em dev aparece salvo `0`/`false`. */
function showClassicLayoutPreviewBanner(): boolean {
  const v = process.env.NEXT_PUBLIC_CAIXA_PDV_LAYOUT_PREVIEW_BANNER
  if (v === "0" || v === "false") return false
  if (v === "1" || v === "true") return true
  return process.env.NODE_ENV === "development"
}

function newCupomSessionId(): string {
  return crypto.randomUUID()
}

const FINALIZACAO_TIMEOUT_MS = 30_000

/** Referência estável de carrinho vazio para o STATE READY GATE (pré-mount). */
const EMPTY_ITENS: ItemCarrinhoComPreco[] = []

function inferirHintCheckout(
  errorMsg: string,
  hints: { padrao: string; cupom: string; sessao: string; rede: string },
): string {
  const l = errorMsg.toLowerCase()
  if (
    l.includes('preç') ||
    l.includes('preco') ||
    l.includes('diverge') ||
    l.includes('divergiu') ||
    l.includes('cupom') ||
    l.includes('inativ') ||
    (l.includes('item') && (l.includes('inválid') || l.includes('invalido')))
  ) return hints.cupom
  if (l.includes('sess') || l.includes('login') || l.includes('expirou')) return hints.sessao
  if (
    l.includes('timeout') ||
    l.includes('demorou') ||
    l.includes('conexão') ||
    l.includes('conexao') ||
    l.includes('rede')
  ) return hints.rede
  return hints.padrao
}

function localeFromIdioma(idioma: Idioma): string {
  if (idioma === "pt") return "pt-BR"
  return "zh-CN"
}

type Props = {
  messages: Mensagens
  idioma: Idioma
  operadorLabel: string
  perfil: string | null
  userId: string | null
}

export function CaixaPageClient({ messages: m, idioma, operadorLabel, perfil, userId }: Props) {
  const { layoutVariant: pdvLayoutVariant, toggleLayoutVariant: onToggleLayoutVariant } =
    useCaixaLayoutPreference()

  const {
    mensagem,
    msgVendaOk,
    toasts,
    setCaixaMensagem,
    setCaixaMensagemVendaOk,
    dismissCaixaToast,
  } = useCaixaMensagens()

  const [codigo, setCodigo] = useState("")
  const [checkoutHint, setCheckoutHint] = useState<string | null>(null)
  const [carregandoRegras, setCarregandoRegras] = useState(true)
  const [limiteSangriaSemGerente, setLimiteSangriaSemGerente] = useState(200)
  const [finalizando, setFinalizando] = useState(false)
  const [turnoRefreshToken, setTurnoRefreshToken] = useState(0)
  const [processandoCaixa, setProcessandoCaixa] = useState(false)
  const [validandoGerente, setValidandoGerente] = useState(false)
  const [gerenteModalAberto, setGerenteModalAberto] = useState(false)
  const [movimentacaoModalTipo, setMovimentacaoModalTipo] =
    useState<TipoMovimentacaoUi | null>(null)
  const [acaoMovimentacao, setAcaoMovimentacao] = useState<{
    tipo: AcaoMovimentacaoTipo
    item: MovimentacaoCaixaDTO
  } | null>(null)
  type ValorModalFluxo = "abrir_caixa" | "fechar_contado"
  const [valorNumericoModal, setValorNumericoModal] = useState<
    null | { fluxo: ValorModalFluxo; initial: string }
  >(null)
  const [motivoFecharModal, setMotivoFecharModal] = useState<
    | null
    | { tipo: "diferenca"; valorContado: number; diferencaFmt: string }
    | { tipo: "blind_retry"; valorContado: number }
  >(null)
  const [gerenteValidadoAte, setGerenteValidadoAte] = useState<string | null>(null)
  const [gerenteToken, setGerenteToken] = useState<string | null>(null)
  const [maxDescontoGerentePercentual, setMaxDescontoGerentePercentual] =
    useState<number>(0)
  const [descontoGerentePercentual, setDescontoGerentePercentual] =
    useState<number>(0)
  const [configCaixaWeb, setConfigCaixaWeb] = useState<Record<string, string>>({})
  const [somFeedbackAtivo, setSomFeedbackAtivo] = useState(false)
  const [summaryCollapsed, setSummaryCollapsed] = useState(true)
  const [confirmacaoPendente, setConfirmacaoPendente] = useState<
    | null
    | { tipo: "sangria" }
    | { tipo: "cancelar"; item: MovimentacaoCaixaDTO }
    | { tipo: "estornar"; item: MovimentacaoCaixaDTO }
  >(null)
  const [abaPdvAtiva, setAbaPdvAtiva] = useState<CaixaPdvOperadorTabId>("produto")
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamentoUi>("dinheiro")

  const {
    caixaStatus,
    carregandoStatus,
    movimentacoes,
    carregandoMovimentacoes,
    movimentandoCaixa,
    processandoAcaoMovimentacao,
    recarregarStatusCaixa,
    handleSalvarMovimentacao,
    handleConfirmarAcaoMovimentacao,
  } = useCaixaStatusMovimentacoes({ m, setCaixaMensagem, movimentacaoModalTipo, acaoMovimentacao, currentUserId: userId })

  // Selectors atômicos: a página só re-renderiza quando itens/totais mudam — não a
  // cada `set` do store (ex.: setCartOwnerForSession/setRegras, disparados em todo bip).
  const {
    itens: itensStore,
    totalBruto: totalBrutoStore,
    totalDesconto: totalDescontoStore,
    totalLiquido: totalLiquidoStore,
    totalItens: totalItensStore,
    totalUnidades: totalUnidadesStore,
  } = useCarrinhoStore(
    useShallow((s) => ({
      itens: s.itens,
      totalBruto: s.totalBruto,
      totalDesconto: s.totalDesconto,
      totalLiquido: s.totalLiquido,
      totalItens: s.totalItens,
      totalUnidades: s.totalUnidades,
    })),
  )
  // STATE READY GATE (React #418): o store persistido (zustand/persist + localStorage
  // síncrono) já vem hidratado no primeiro render do cliente, divergindo do HTML do
  // SSR (carrinho vazio). Enquanto não montar, expomos o estado neutro idêntico ao
  // SSR; pós-mount revelamos os valores reais num update normal (sem mismatch).
  const cartMounted = useHasMounted()
  const itens = cartMounted ? itensStore : EMPTY_ITENS
  const totalBruto = cartMounted ? totalBrutoStore : 0
  const totalDesconto = cartMounted ? totalDescontoStore : 0
  const totalLiquido = cartMounted ? totalLiquidoStore : 0
  const totalItens = cartMounted ? totalItensStore : 0
  const totalUnidades = cartMounted ? totalUnidadesStore : 0
  // Ações têm referência estável no zustand — selecionadas individualmente, nunca causam re-render.
  const setRegras = useCarrinhoStore((s) => s.setRegras)
  const setCartOwnerForSession = useCarrinhoStore((s) => s.setCartOwnerForSession)
  const adicionarItem = useCarrinhoStore((s) => s.adicionarItem)
  const alterarQuantidade = useCarrinhoStore((s) => s.alterarQuantidade)
  const removerItem = useCarrinhoStore((s) => s.removerItem)
  const restaurarUltimoRemovido = useCarrinhoStore((s) => s.restaurarUltimoRemovido)
  const limparCarrinho = useCarrinhoStore((s) => s.limparCarrinho)

  const economiaPrecoAtacadoAuto = useMemo(() => {
    return itens.reduce((acc, it) => {
      if (it.resultado?.tipoPreco !== "ATACADO") return acc
      const o = it.resultado.precoOriginal
      const u = it.resultado.precoUnitario
      if (!Number.isFinite(o) || !Number.isFinite(u) || o <= u) return acc
      return acc + (o - u) * it.quantidade
    }, 0)
  }, [itens])

  const descontoGerenteAplicado = aplicarDescontoGerenteSobreTotal({
    totalLiquido,
    percentual: descontoGerentePercentual,
    maxPermitido: maxDescontoGerentePercentual,
  })
  const valorDescontoGerente = descontoGerenteAplicado.descontoValor
  const totalLiquidoComGerente = descontoGerenteAplicado.totalLiquidoComDesconto
  const descontoGerentePercentualEfetivo = descontoGerenteAplicado.percentualClamped
  const formaPagamento = useMemo(
    () => metodoPagamentoToForma(metodoPagamento),
    [metodoPagamento],
  )

  const {
    pagamentos,
    somaParcelas,
    diferenca: diferencaPagamento,
    podeAdicionarParcela,
    formasDisponiveis,
    adicionarParcela,
    removerParcela,
    atualizarForma,
    atualizarValor,
    autoCompletarUltima,
    resetPagamentos,
  } = useCaixaPagamentos(totalLiquidoComGerente, formaPagamento)

  const loc = localeFromIdioma(idioma)
  const buscaInputRef = useRef<HTMLInputElement>(null)
  /** UUID estável entre duplo clique / retry; zera após venda OK ou «Novo cupom». */
  const vendaIdempotenciaRef = useRef<string | null>(null)

  const cupomSessionIdRef = useRef<string>(newCupomSessionId())
  const lastScanItemRef = useRef<{ codigo: string; itemId: string; produtoId: string; ts: number } | null>(null)
  const lastReciboRef = useRef<ReciboVenda | null>(null)
  const [reimprimirModalAberto, setReimprimirModalAberto] = useState(false)

  const thermal = useThermalPrinter()

  const focarCampoBusca = useCallback(() => {
    requestAnimationFrame(() => {
      // Não roubar foco enquanto um modal está aberto (senha do gerente, valor de
      // fechamento, confirmação, recibo): o ímã de 3s ou o refoco pós-venda não devem
      // puxar o foco para a busca atrás do diálogo.
      if (typeof document !== "undefined" && document.querySelector('[role="dialog"]')) return
      buscaInputRef.current?.focus()
    })
  }, [])

  // Idle focus magnet: after 3s of no keyboard/pointer activity, refocus the
  // search field — mas só quando o foco está "perdido" (body/null/a própria
  // busca). Se o operador tabulou para outro elemento interativo (botão,
  // item do carrinho) e ficou parado pensando, o ímã não deve arrancá-lo de
  // lá (Fase 2 — auditoria de acessibilidade, WCAG 2.4.3).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const refocarSeFocoPerdido = () => {
      const ativo = typeof document !== "undefined" ? document.activeElement : null
      const focoPerdido = !ativo || ativo === document.body || ativo === buscaInputRef.current
      if (focoPerdido) focarCampoBusca()
    }
    const reset = () => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(refocarSeFocoPerdido, 3000)
    }
    const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null } }
    window.addEventListener('keydown', reset)
    window.addEventListener('pointerdown', reset)
    reset()
    return () => {
      clear()
      window.removeEventListener('keydown', reset)
      window.removeEventListener('pointerdown', reset)
    }
  }, [focarCampoBusca])

  /* Auto-expand/collapse financial summary based on cart state */
  useEffect(() => {
    if (itens.length === 0) {
      /* Cart is empty → collapse summary */
      setSummaryCollapsed(true)
    } else if (summaryCollapsed && itens.length > 0) {
      /* First item added → auto-expand summary */
      setSummaryCollapsed(false)
    }
  }, [itens.length, summaryCollapsed])

  const tocarFeedback = useCallback(
    (kind: "ok" | "erro") => {
      if (!somFeedbackAtivo) return
      if (typeof window === "undefined") return
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "sine"
      osc.frequency.value = kind === "ok" ? 880 : 220
      gain.gain.value = 0.03
      osc.start()
      osc.stop(ctx.currentTime + 0.08)
      osc.onended = () => void ctx.close()
    },
    [somFeedbackAtivo],
  )

  const { enqueueLeitura, buscandoPipeline, flushLeiturasPendentes, pipelineDebug } = useCaixaScanPipeline({
    m,
    setCaixaMensagem,
    setCaixaMensagemScannerInfo: setCaixaMensagem,
    setCodigo,
    tocarFeedback,
    focarCampoBusca,
    adicionarItem,
    setCartOwnerForSession,
    getActiveCupomSessionId: () => cupomSessionIdRef.current,
    onItemAdded: useCallback(
      (info: { codigo: string; itemId: string; produtoId: string }) => {
        lastScanItemRef.current = { ...info, ts: Date.now() }
      },
      [],
    ),
  })

  const pagamentoControlesDesabilitados =
    finalizando || buscandoPipeline || carregandoRegras

  const metodoPagamentoSelector = useMemo(
    () => (
      <CaixaPdvMetodoPagamentoSelector
        m={m}
        value={metodoPagamento}
        onChange={setMetodoPagamento}
        disabled={pagamentoControlesDesabilitados}
        variant={pdvLayoutVariant === "classic" ? "classic" : "default"}
      />
    ),
    [m, metodoPagamento, setMetodoPagamento, pagamentoControlesDesabilitados, pdvLayoutVariant],
  )

  const limparEstadoDescontoGerente = useCallback(() => {
    setGerenteValidadoAte(null)
    setGerenteToken(null)
    setMaxDescontoGerentePercentual(0)
    setDescontoGerentePercentual(0)
  }, [])

  useCaixaBootstrapData({
    regrasErroPrefixo: m.caixa.regras_erro_prefixo,
    setCarregandoRegras,
    setRegras,
    setCaixaMensagem,
    setLimiteSangriaSemGerente,
    setConfigCaixaWeb,
  })

  const handleAdicionar = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const sid = cupomSessionIdRef.current
      const r = enqueueLeitura(codigo, {
        source: "form_submit",
        cupomSessionId: sid,
        // Temporário: mesmo valor que cupomSessionId; futuro = trace por evento (não contrato eterno).
        correlationId: sid,
      })
      if (!r) return
      if (!r.ok && r.reason === "queue_full") {
        setCaixaMensagem(m.caixa.msg_fila_leituras_cheia, { kind: "warning" })
      }
    },
    [codigo, enqueueLeitura, m.caixa.msg_fila_leituras_cheia, setCaixaMensagem],
  )

  useScannerDetector(
    useCallback(
      (scannedCode: string) => {
        // 500ms dedupe: same barcode → increment quantity instead of a new scan
        const now = Date.now()
        const last = lastScanItemRef.current
        if (last && last.codigo === scannedCode && now - last.ts < 500) {
          const item = useCarrinhoStore.getState().itens.find((i) => i.id === last.itemId)
          if (item) {
            alterarQuantidade(last.itemId, item.quantidade + 1)
            lastScanItemRef.current = { ...last, ts: now }
            return
          }
        }
        const sid = cupomSessionIdRef.current
        const r = enqueueLeitura(scannedCode, {
          source: "scanner",
          cupomSessionId: sid,
          // Temporário: alinhar correlation ao cupom; futuro = trace por leitura.
          correlationId: sid,
        })
        if (!r) return
        if (!r.ok && r.reason === "queue_full") {
          setCaixaMensagem(m.caixa.msg_fila_leituras_cheia, { kind: "warning" })
        }
      },
      [alterarQuantidade, enqueueLeitura, m.caixa.msg_fila_leituras_cheia, setCaixaMensagem],
    ),
    {
      enabled: true,
      maxIntervalMs: 40,
      flushTimeoutMs: 100,
      minLength: 3,
    },
  )

  const handleAlterarQuantidade = useCallback(
    (itemId: string, quantidade: number) => {
      if (Number.isNaN(quantidade)) return
      if (quantidade <= 0) {
        removerItem(itemId)
        setCaixaMensagem(m.caixa.msg_item_removido_qtde_zero, { kind: "info" })
        return
      }
      // Alteração de quantidade: preço já foi calculado no scan (ação unificada)
      // Não é necessário recalcular no hot-path
      alterarQuantidade(itemId, quantidade)
    },
    [
      alterarQuantidade,
      m.caixa.msg_item_removido_qtde_zero,
      removerItem,
      setCaixaMensagem,
    ],
  )

  const handleRemover = useCallback(
    (itemId: string) => {
      removerItem(itemId)
      // #13: soft-undo. O store guarda a linha + posição; toast lembra o atalho.
      setCaixaMensagem(m.caixa.msg_item_removido_desfazer, { kind: "info" })
    },
    [removerItem, setCaixaMensagem, m.caixa.msg_item_removido_desfazer],
  )

  const handleDesfazerRemocao = useCallback(() => {
    const reposto = useCarrinhoStore.getState().ultimoRemovido
    if (!reposto) return
    restaurarUltimoRemovido()
    setCaixaMensagem(m.caixa.msg_item_restaurado, { kind: "success" })
  }, [restaurarUltimoRemovido, setCaixaMensagem, m.caixa.msg_item_restaurado])

  const handleNovoCupom = useCallback(() => {
    vendaIdempotenciaRef.current = null
    flushLeiturasPendentes({ reason: "new_cupom" })
    cupomSessionIdRef.current = newCupomSessionId()
    limparCarrinho()
    resetPagamentos()
    setMetodoPagamento("dinheiro")
    setCodigo("")
    setCaixaMensagem(null)
    setCheckoutHint(null)
    limparEstadoDescontoGerente()
    setAbaPdvAtiva("produto")
    focarCampoBusca()
  }, [
    flushLeiturasPendentes,
    focarCampoBusca,
    limparCarrinho,
    limparEstadoDescontoGerente,
    resetPagamentos,
    setCaixaMensagem,
  ])

  const parseValorMonetario = useCallback((raw: string | null): number | null => {
    if (raw == null) return null
    const normalizado = raw.trim().replace(",", ".")
    if (!normalizado) return null
    const parsed = Number(normalizado)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return roundMoney2(parsed)
  }, [])

  const erroExigeMotivoFechamento = useCallback((error: string) => {
    const e = error.toLowerCase()
    return e.includes("exige motivo") || (e.includes("diferença") && e.includes("motivo"))
  }, [])

  const executarFecharCaixa = useCallback(
    async (valorContado: number, motivo?: string) => {
      setProcessandoCaixa(true)
      setCaixaMensagem(null)
      try {
        const res = await fecharCaixaOperador({ valorContado, motivo })
        const blind = isCaixaAberto(caixaStatus) && caixaStatus.blindClosureEnabled
        if (!res.ok && blind && erroExigeMotivoFechamento(res.error) && motivo == null) {
          setMotivoFecharModal({ tipo: "blind_retry", valorContado })
          return
        }
        if (!res.ok) {
          setCaixaMensagem(res.error, { kind: "error" })
          tocarFeedback("erro")
          return
        }
        await recarregarStatusCaixa()
        setCaixaMensagem(
          res.alreadyClosed
            ? m.caixa.msg_caixa_ja_fechado
            : caixaFmt(m.caixa.msg_caixa_fechado, {
                moeda: m.caixa.moeda_prefixo,
                sistema: formatDecimalBRL(res.valorSistemaDinheiro),
                contado: formatDecimalBRL(res.valorContado),
                sinal: res.diferenca > 0 ? "+" : "",
                diferenca: formatDecimalBRL(res.diferenca),
              }),
          { kind: "success" },
        )
        tocarFeedback("ok")
      } finally {
        setProcessandoCaixa(false)
      }
    },
    [caixaStatus, erroExigeMotivoFechamento, recarregarStatusCaixa, setCaixaMensagem, tocarFeedback, m],
  )

  const handleAbrirCaixa = useCallback(() => {
    if (processandoCaixa) return
    setValorNumericoModal({ fluxo: "abrir_caixa", initial: "0" })
  }, [processandoCaixa])

  const handleFecharCaixa = useCallback(() => {
    if (processandoCaixa) return
    if (itens.length > 0) {
      setCaixaMensagem(m.caixa.msg_fechar_cupom_nao_vazio, { kind: "warning" })
      return
    }
    setValorNumericoModal({ fluxo: "fechar_contado", initial: "" })
  }, [processandoCaixa, itens.length, m.caixa.msg_fechar_cupom_nao_vazio, setCaixaMensagem])

  const handleAbrirSuprimento = useCallback(() => {
    setMovimentacaoModalTipo("suprimento")
  }, [])

  const handleAbrirSangria = useCallback(() => {
    setConfirmacaoPendente({ tipo: "sangria" })
  }, [])

  const handleConfirmarAcaoSensivel = useCallback(() => {
    if (!confirmacaoPendente) return
    if (confirmacaoPendente.tipo === "sangria") {
      setMovimentacaoModalTipo("sangria")
    } else if (confirmacaoPendente.tipo === "cancelar") {
      setAcaoMovimentacao({ tipo: "cancelar", item: confirmacaoPendente.item })
    } else {
      setAcaoMovimentacao({ tipo: "estornar", item: confirmacaoPendente.item })
    }
    setConfirmacaoPendente(null)
  }, [confirmacaoPendente])

  const onConfirmValorNumerico = useCallback(
    (v: number) => {
      if (!valorNumericoModal) return
      const { fluxo } = valorNumericoModal
      if (fluxo === "abrir_caixa") {
        void (async () => {
          setProcessandoCaixa(true)
          setCaixaMensagem(null)
          try {
            const res = await abrirCaixaOperador(v)
            if (!res.ok) {
              setCaixaMensagem(res.error, { kind: "error" })
              tocarFeedback("erro")
              return
            }
            setCaixaMensagem(
              caixaFmt(m.caixa.msg_caixa_aberto, { id: res.caixaId.slice(0, 8) }),
              { kind: "success" },
            )
            tocarFeedback("ok")
            await recarregarStatusCaixa()
          } finally {
            setProcessandoCaixa(false)
          }
        })()
        return
      }
      const blind = isCaixaAberto(caixaStatus) && caixaStatus.blindClosureEnabled
      const valorSistemaDinheiro = isCaixaAberto(caixaStatus) ? caixaStatus.valorSistemaDinheiro : 0
      const diferencaEstimada = isCaixaAberto(caixaStatus)
        ? roundMoney2(v - valorSistemaDinheiro)
        : null
      if (!blind && diferencaEstimada !== null && Math.abs(diferencaEstimada) > 5) {
        setMotivoFecharModal({
          tipo: "diferenca",
          valorContado: v,
          diferencaFmt: formatDecimalBRL(diferencaEstimada),
        })
        return
      }
      void executarFecharCaixa(v, undefined)
    },
    [
      valorNumericoModal,
      caixaStatus,
      executarFecharCaixa,
      recarregarStatusCaixa,
      setCaixaMensagem,
      tocarFeedback,
      m,
    ],
  )

  const onConfirmMotivoFechar = useCallback(
    (motivo: string) => {
      if (!motivoFecharModal) return
      void executarFecharCaixa(motivoFecharModal.valorContado, motivo)
    },
    [motivoFecharModal, executarFecharCaixa],
  )

  const handleFinalizar = useCallback(async () => {
    if (itens.length === 0 || finalizando) return
    if (
      configCaixaWeb.vendas_suspensas === 'true' &&
      perfil !== null &&
      !['GERENTE', 'DONO', 'ADMIN'].includes(perfil)
    ) {
      const motivo = configCaixaWeb.motivo_suspensao?.trim()
      setCaixaMensagem(
        motivo
          ? caixaFmt(m.caixa.msg_vendas_suspensas_motivo, { motivo })
          : m.caixa.msg_vendas_suspensas,
        { kind: 'error' },
      )
      return
    }
    if (gerenteValidadoAte && Date.now() >= Date.parse(gerenteValidadoAte)) {
      limparEstadoDescontoGerente()
      setCaixaMensagem(m.caixa.msg_token_expirado, { kind: "warning" })
      return
    }
    const totalPagamentos = roundMoney2(
      pagamentos.reduce((acc, pagamento) => acc + pagamento.valor, 0),
    )
    if (totalPagamentos < totalLiquidoComGerente - 0.01) {
      setCaixaMensagem(
        caixaFmt(m.caixa.msg_pagamento_split_invalido, {
          esperado: formatDecimalBRL(totalLiquidoComGerente),
          informado: formatDecimalBRL(totalPagamentos),
        }),
        { kind: "warning" },
      )
      return
    }
    // Normalizar parcelas: desconta troco da última parcela DINHEIRO
    const parcelasNormalizadas = pagamentos.map((p) => ({
      formaPagamento: p.formaPagamento,
      valor: p.valor,
    }))
    const excesso = roundMoney2(totalPagamentos - totalLiquidoComGerente)
    if (excesso > 0.01) {
      let idxDinheiro = -1
      for (let i = parcelasNormalizadas.length - 1; i >= 0; i--) {
        if (parcelasNormalizadas[i].formaPagamento === "DINHEIRO") {
          idxDinheiro = i
          break
        }
      }
      // Always distribute from back to front; prioritise DINHEIRO parcel first
      let remaining = excesso
      if (idxDinheiro >= 0 && remaining > 0.001) {
        const deduct = Math.min(parcelasNormalizadas[idxDinheiro].valor, remaining)
        parcelasNormalizadas[idxDinheiro].valor = roundMoney2(
          parcelasNormalizadas[idxDinheiro].valor - deduct,
        )
        remaining = roundMoney2(remaining - deduct)
      }
      for (let i = parcelasNormalizadas.length - 1; i >= 0 && remaining > 0.001; i--) {
        if (i === idxDinheiro) continue
        const deduct = Math.min(parcelasNormalizadas[i].valor, remaining)
        parcelasNormalizadas[i].valor = roundMoney2(parcelasNormalizadas[i].valor - deduct)
        remaining = roundMoney2(remaining - deduct)
      }
    }
    const parcelasFiltradas = parcelasNormalizadas.filter((p) => p.valor > 0)
    const parcelasParaEnviar =
      parcelasFiltradas.length > 0
        ? parcelasFiltradas
        : [{ formaPagamento: pagamentos[0]?.formaPagamento ?? "DINHEIRO", valor: 0 }]

    // GUARD RAIL — snapshot imutável da venda + validação fail-fast contra a
    // função canônica de totais. Bloqueia a finalização (sem fallback silencioso)
    // se houver qualquer inconsistência entre o carrinho exibido e os itens reais.
    const checkoutSnapshot = buildCheckoutSnapshot(itens, {
      totalBruto,
      totalLiquido,
      totalDesconto,
    })
    const snapshotCheck = validateCheckoutSnapshot(checkoutSnapshot)
    if (!snapshotCheck.ok) {
      console.error("[caixa/checkout-snapshot]", snapshotCheck.violations)
      setCaixaMensagem(m.caixa.msg_falha_finalizar, { kind: "error" })
      // Diagnóstico concreto: nunca bloquear sem dizer o motivo (a 1ª violação do
      // snapshot já é uma mensagem legível, ex.: "Carrinho vazio — nada a finalizar.").
      setCheckoutHint(snapshotCheck.violations[0]?.message ?? m.caixa.msg_checkout_hint_cupom)
      tocarFeedback("erro")
      return
    }

    setFinalizando(true)
    setCaixaMensagem(null)
    setCheckoutHint(null)
    try {
      if (!vendaIdempotenciaRef.current) {
        vendaIdempotenciaRef.current = crypto.randomUUID()
      }
      const payload: FinalizarVendaInput = {
        idempotencyKey: vendaIdempotenciaRef.current,
        formaPagamento: pagamentos[0]?.formaPagamento ?? "DINHEIRO",
        totalBruto,
        totalDesconto:
          descontoGerentePercentualEfetivo > 0
            ? roundMoney2(totalDesconto + valorDescontoGerente)
            : totalDesconto,
        totalLiquido: totalLiquidoComGerente,
        descontoGerenteToken:
          descontoGerentePercentualEfetivo > 0 ? gerenteToken ?? undefined : undefined,
        descontoGerentePercentual:
          descontoGerentePercentualEfetivo > 0 ? descontoGerentePercentualEfetivo : undefined,
        pagamentos: parcelasParaEnviar,
        // Itens derivados do snapshot imutável já validado — não do store mutável.
        itens: checkoutSnapshot.itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoOriginal: i.precoOriginal,
          precoUnitario: i.precoUnitario,
          tipoPreco: i.tipoPreco,
        })),
      }
      const timeoutResult: { ok: false; error: string } = {
        ok: false,
        error: m.caixa.msg_checkout_timeout,
      }
      const res = await Promise.race([
        finalizarVendaCaixa(payload),
        new Promise<typeof timeoutResult>((resolve) =>
          setTimeout(() => resolve(timeoutResult), FINALIZACAO_TIMEOUT_MS),
        ),
      ])
      if (res.ok) {
        lastReciboRef.current = {
          vendaId: res.vendaId,
          data: new Date(),
          itens: itens.map((i) => ({
            nome: i.nome,
            quantidade: i.quantidade,
            precoUnitario: i.resultado?.precoUnitario ?? i.precoUnitario ?? 0,
            precoOriginal: i.resultado?.precoOriginal ?? i.precoOriginal ?? 0,
            tipoPreco: i.resultado?.tipoPreco ?? 'VAREJO',
          })),
          pagamentos: parcelasParaEnviar,
          totalBruto,
          totalDesconto: payload.totalDesconto,
          totalLiquidoComGerente,
          descontoGerentePercentual: descontoGerentePercentualEfetivo,
          valorDescontoGerente,
          moeda: m.caixa.moeda_prefixo,
        }
        setCheckoutHint(null)
        setReimprimirModalAberto(true)
        vendaIdempotenciaRef.current = null
        limparCarrinho()
        limparEstadoDescontoGerente()
        resetPagamentos()
        setTurnoRefreshToken((t) => t + 1)
        setCaixaMensagemVendaOk(
          caixaFmt(m.caixa.msg_venda_ok, { id: res.vendaId.slice(0, 8) }),
          { kind: "success" },
        )
        tocarFeedback("ok")
        await recarregarStatusCaixa()
      } else {
        const hint = inferirHintCheckout(res.error, {
          padrao: m.caixa.msg_checkout_hint_padrao,
          cupom: m.caixa.msg_checkout_hint_cupom,
          sessao: m.caixa.msg_checkout_hint_sessao,
          rede: m.caixa.msg_checkout_hint_rede,
        })
        setCaixaMensagem(res.error, { kind: "error" })
        setCheckoutHint(hint)
        tocarFeedback("erro")
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[caixa/finalizar-venda]', {
        idempotencyKey: vendaIdempotenciaRef.current,
        error: errMsg,
      })
      setCaixaMensagem(m.caixa.msg_falha_finalizar, { kind: "error" })
      // Diagnóstico concreto também na exceção: deriva causa provável (rede /
      // sessão / cupom / preço) do erro real em vez do hint genérico "tente de novo".
      setCheckoutHint(
        inferirHintCheckout(errMsg, {
          padrao: m.caixa.msg_checkout_hint_padrao,
          cupom: m.caixa.msg_checkout_hint_cupom,
          sessao: m.caixa.msg_checkout_hint_sessao,
          rede: m.caixa.msg_checkout_hint_rede,
        }),
      )
      tocarFeedback("erro")
    } finally {
      setFinalizando(false)
    }
  }, [
    configCaixaWeb,
    descontoGerentePercentualEfetivo,
    valorDescontoGerente,
    finalizando,
    pagamentos,
    gerenteValidadoAte,
    gerenteToken,
    itens,
    limparEstadoDescontoGerente,
    limparCarrinho,
    resetPagamentos,
    totalBruto,
    totalDesconto,
    totalLiquido,
    totalLiquidoComGerente,
    m,
    recarregarStatusCaixa,
    setCaixaMensagem,
    setCaixaMensagemVendaOk,
    tocarFeedback,
    perfil,
  ])

  useCaixaGerenteTokenExpiry({
    gerenteValidadoAte,
    onExpire: useCallback(() => {
      limparEstadoDescontoGerente()
      setCaixaMensagem(m.caixa.msg_token_expirado, { kind: "warning" })
    }, [limparEstadoDescontoGerente, m.caixa.msg_token_expirado, setCaixaMensagem]),
  })

  const pdvClassicAtalhos = useMemo(
    () =>
      pdvLayoutVariant === "classic"
        ? {
            onExcluirVenda: handleNovoCupom,
            onFinalizarVenda: () => void handleFinalizar(),
            abas: {
              produto: () => {
                setAbaPdvAtiva("produto")
                focarCampoBusca()
              },
              cliente: () => setAbaPdvAtiva("cliente"),
              pgto: () => setAbaPdvAtiva("pgto"),
            },
          }
        : null,
    [pdvLayoutVariant, handleNovoCupom, handleFinalizar, focarCampoBusca],
  )

  useCaixaKeyboardShortcuts({
    caixaAberto: isCaixaAberto(caixaStatus),
    movimentandoCaixa,
    onAbrirSuprimento: handleAbrirSuprimento,
    onAbrirSangria: handleAbrirSangria,
    onFinalizar: () => void handleFinalizar(),
    onFecharCaixa: () => void handleFecharCaixa(),
    onFocarBusca: focarCampoBusca,
    onNovoCupom: handleNovoCupom,
    onReimprimir: useCallback(() => {
      if (lastReciboRef.current) setReimprimirModalAberto(true)
    }, []),
    onDesfazerRemocao: handleDesfazerRemocao,
    pdvClassicAtalhos,
  })

  const handleValidateSenhaGerente = useCallback(
    async (senha: string): Promise<ValidarSenhaGerenteResult> => {
      setValidandoGerente(true)
      try {
        const res = await validarGerenteDesconto({
          senha,
          deviceFingerprint: getDeviceFingerprint(),
        })
        if (!res.ok) {
          const lock =
            res.lockUntil != null
              ? caixaFmt(m.caixa.msg_lock_ate, {
                  data: new Date(res.lockUntil).toLocaleString(loc),
                })
              : ""
          return {
            ok: false,
            error: caixaFmt(m.caixa.msg_validacao_falha, {
              erro: res.error,
              lock,
            }),
          }
        }
        return {
          ok: true,
          token: res.token,
          expiraEm: res.expiraEm,
          maxDescontoPercentual: res.maxDescontoPercentual,
        }
      } catch {
        return { ok: false, error: m.caixa.msg_falha_gerente_rede }
      } finally {
        setValidandoGerente(false)
      }
    },
    [m, loc],
  )

  const handleAplicarDescontoGerente = useCallback(
    (payload: {
      token: string
      expiraEm: string
      maxDescontoPercentual: number
      percentual: number
    }) => {
      setGerenteValidadoAte(payload.expiraEm)
      setGerenteToken(payload.token)
      setMaxDescontoGerentePercentual(payload.maxDescontoPercentual)
      setDescontoGerentePercentual(payload.percentual)
      setCaixaMensagem(
        caixaFmt(m.caixa.msg_gerente_ok, {
          pct: payload.percentual.toFixed(2),
          hora: new Date(payload.expiraEm).toLocaleTimeString(loc),
        }),
        { kind: "success" },
      )
      tocarFeedback("ok")
    },
    [m, loc, setCaixaMensagem, tocarFeedback],
  )

  const handleAbrirCaixaClick = useCallback(() => void handleAbrirCaixa(), [handleAbrirCaixa])
  const handleFecharCaixaClick = useCallback(() => void handleFecharCaixa(), [handleFecharCaixa])
  const handleFinalizarClick = useCallback(() => void handleFinalizar(), [handleFinalizar])
  const abrirGerenteModal = useCallback(() => setGerenteModalAberto(true), [])
  const handleCancelarMovimentacao = useCallback(
    (item: MovimentacaoCaixaDTO) => setConfirmacaoPendente({ tipo: "cancelar", item }),
    [],
  )
  const handleEstornarMovimentacao = useCallback(
    (item: MovimentacaoCaixaDTO) => setConfirmacaoPendente({ tipo: "estornar", item }),
    [],
  )

  return (
    <>
      <div
        data-caixa-layout={pdvLayoutVariant === "classic" ? "classic" : undefined}
        suppressHydrationWarning
        className={cn(
          "h-[100dvh] overflow-hidden flex flex-col text-[14px] leading-5",
          pdvLayoutVariant === "classic" ? "bg-background text-foreground" : "caixa-oriental-root",
        )}
      >
        {pdvLayoutVariant !== "classic" && (
          <span
            aria-hidden
            className="pointer-events-none fixed right-6 bottom-6 select-none text-[7rem] leading-none font-black text-amber-400/[0.06] z-0"
          >
            龍
          </span>
        )}
        <CaixaHeader
          m={m}
          idioma={idioma}
          layoutVariant={pdvLayoutVariant}
          onToggleLayoutVariant={onToggleLayoutVariant}
          operadorLabel={operadorLabel}
          caixaStatus={caixaStatus}
          carregandoStatus={carregandoStatus}
          processandoCaixa={processandoCaixa}
          onAbrirCaixa={handleAbrirCaixaClick}
          onFecharCaixa={handleFecharCaixaClick}
          onTentarStatusNovamente={() => void recarregarStatusCaixa()}
          printerStatus={thermal.status}
          printerDeviceName={thermal.deviceInfo?.name ?? thermal.savedInfo?.name}
        />
        <div className="flex-1 flex flex-col min-h-0">
          {pdvLayoutVariant === "classic" && showClassicLayoutPreviewBanner() ? (
            <CaixaPdvLayoutPreviewBanner m={m} />
          ) : null}
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 px-4 sm:px-6 pt-4 pb-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(11.5rem,15rem)] md:grid-rows-[minmax(0,1fr)]">
            <div className="min-h-0 flex flex-col md:min-h-0">
              <CaixaPdvOperadorTabs
                m={m}
                idioma={idioma}
                tab={abaPdvAtiva}
                onTabChange={setAbaPdvAtiva}
                layoutVariant={pdvLayoutVariant}
                mostrarAtalhos={pdvLayoutVariant === "classic"}
                operadorLabel={operadorLabel}
                pagamentos={pagamentos}
                totalLiquidoComGerente={totalLiquidoComGerente}
                somaParcelas={somaParcelas}
                diferenca={diferencaPagamento}
                podeAdicionarParcela={podeAdicionarParcela}
                formasDisponiveis={formasDisponiveis}
                onAdicionarParcela={adicionarParcela}
                onRemoverParcela={removerParcela}
                onAtualizarForma={atualizarForma}
                onAtualizarValor={atualizarValor}
                onAutoCompletar={autoCompletarUltima}
                moedaPrefixo={m.caixa.moeda_prefixo}
                metodoPagamentoPanel={metodoPagamentoSelector}
                produtoPanel={
                  pdvLayoutVariant === "classic" ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                      <CaixaOperadorContextBar m={m} idioma={idioma} configCaixaWeb={configCaixaWeb} />
                      <div className="shrink-0">
                        <CaixaSearchBar
                          ref={buscaInputRef}
                          m={m}
                          codigo={codigo}
                          onCodigoChange={setCodigo}
                          onSubmit={handleAdicionar}
                          onNovoCupom={handleNovoCupom}
                          buscando={buscandoPipeline}
                          carregandoRegras={carregandoRegras}

                          somAtivo={somFeedbackAtivo}
                          onToggleSom={() => setSomFeedbackAtivo((prev) => !prev)}
                          hideNovoCupom
                          compact={codigo.trim().length > 0}
                        />
                      </div>
                      <div className="shrink-0">
                        <CaixaMessageBanner mensagem={mensagem} msgVendaOk={msgVendaOk} kind={checkoutHint ? 'error' : undefined} hint={checkoutHint} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <CaixaOperadorContextBar m={m} idioma={idioma} configCaixaWeb={configCaixaWeb} />
                      <CaixaSearchBar
                        ref={buscaInputRef}
                        m={m}
                        codigo={codigo}
                        onCodigoChange={setCodigo}
                        onSubmit={handleAdicionar}
                        onNovoCupom={handleNovoCupom}
                        buscando={buscandoPipeline}
                        carregandoRegras={carregandoRegras}
                        somAtivo={somFeedbackAtivo}
                        onToggleSom={() => setSomFeedbackAtivo((prev) => !prev)}
                      />
                      <CaixaMessageBanner mensagem={mensagem} msgVendaOk={msgVendaOk} kind={checkoutHint ? 'error' : undefined} hint={checkoutHint} />
                    </>
                  )
                }
              />
            </div>
            <section className={cn("flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-xl md:min-h-0", pdvLayoutVariant === "classic" ? "border border-border bg-card" : "dragon-glass-card")}>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <CaixaCartList
                  m={m}
                  idioma={idioma}
                  itens={itens}
                  moeda={m.caixa.moeda_prefixo}
                  listEmptyVariant={
                    pdvLayoutVariant === "classic" ? "pdv_classic" : "default"
                  }
                  onAlterarQuantidade={handleAlterarQuantidade}
                  onRemover={handleRemover}
                />
              </div>
              {pdvLayoutVariant === "classic" && (
                <CaixaPdvCartSaleBar
                  m={m}
                 onExcluirVenda={handleNovoCupom}
                  onFinalizar={handleFinalizarClick}
                  finalizando={finalizando}
                  movimentandoCaixa={movimentandoCaixa}
                  caixaAberto={isCaixaAberto(caixaStatus)}
                  itensLength={itens.length}
                  buscando={buscandoPipeline}
                  carregandoRegras={carregandoRegras}
                  totalLiquidoComGerente={totalLiquidoComGerente}
                  totalBruto={totalBruto}
                  totalDesconto={totalDesconto}
                  moedaPrefixo={m.caixa.moeda_prefixo}
                  metodoPagamentoPanel={metodoPagamentoSelector}
                />
              )}
            </section>
            <aside
              className={cn(
                "hidden min-h-0 flex flex-col gap-2 rounded-xl border p-3 text-sm md:flex",
                pdvLayoutVariant === "classic"
                  ? "border-border bg-card text-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)] rounded-[1.4rem]"
                  : "border-jl-border-1 bg-jl-surface-elev text-jl-fg-1",
              )}
            >
              <button
                type="button"
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-center text-sm font-semibold disabled:pointer-events-none disabled:opacity-50",
                  pdvLayoutVariant === "classic"
                    ? "border-border bg-primary text-primary-foreground hover:bg-primary/90"
                    : "app-btn-accent",
                )}
                onClick={handleNovoCupom}
                disabled={carregandoRegras || finalizando}
              >
                {m.caixa.novo_cupom}
              </button>
              {lastReciboRef.current && (
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-center text-sm font-semibold disabled:pointer-events-none disabled:opacity-50",
                    pdvLayoutVariant === "classic"
                      ? "border-border bg-card text-foreground hover:bg-muted"
                      : "app-btn-neutral",
                  )}
                  onClick={() => setReimprimirModalAberto(true)}
                >
                  {m.caixa.reimprimir_cupom}
                </button>
              )}
              <div
                className={cn(
                  "border-t pt-2 text-xs font-semibold uppercase tracking-wide",
                  pdvLayoutVariant === "classic" ? "border-border text-muted-foreground" : "border-jl-border-1 text-jl-fg-3",
                )}
              >
                {m.caixa.rail_titulo_operacoes}
              </div>
              <CaixaPdvOperacoesButtons
                m={m}
                idioma={idioma}
                variant={pdvLayoutVariant === "classic" ? "classic" : "default"}
                carregandoRegras={carregandoRegras}
                caixaStatus={caixaStatus}
                caixaAberto={isCaixaAberto(caixaStatus)}
                movimentandoCaixa={movimentandoCaixa}
                finalizando={finalizando}
                validandoGerente={validandoGerente}
                gerenteValidadoAte={gerenteValidadoAte}
                onAbrirSuprimento={handleAbrirSuprimento}
                onAbrirSangria={handleAbrirSangria}
                onValidarGerente={abrirGerenteModal}
              />
              <div
                className={cn(
                  "border-t pt-2 text-xs font-semibold uppercase tracking-wide",
                  pdvLayoutVariant === "classic" ? "border-border text-muted-foreground" : "border-jl-border-1 text-jl-fg-3",
                )}
              >
                {m.caixa.rail_titulo_em_aberto}
              </div>
              <CaixaRailTurnoSummary
                m={m}
                idioma={idioma}
                caixaAberto={isCaixaAberto(caixaStatus)}
                layoutVariant={pdvLayoutVariant === "classic" ? "classic" : "default"}
                refreshToken={turnoRefreshToken}
              />
            </aside>
          </div>
          {pdvLayoutVariant === "classic" && (
            <div
              className={cn(
                "border-t px-4 py-3 sm:px-6 md:hidden",
                "border-border bg-card text-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)]",
              )}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {m.caixa.rail_titulo_operacoes}
              </div>
              <div className="mt-2">
                <CaixaPdvOperacoesButtons
                  m={m}
                  idioma={idioma}
                  variant="classic"
                  carregandoRegras={carregandoRegras}
                  caixaStatus={caixaStatus}
                  caixaAberto={isCaixaAberto(caixaStatus)}
                  movimentandoCaixa={movimentandoCaixa}
                  finalizando={finalizando}
                  validandoGerente={validandoGerente}
                  gerenteValidadoAte={gerenteValidadoAte}
                  onAbrirSuprimento={handleAbrirSuprimento}
                  onAbrirSangria={handleAbrirSangria}
                  onValidarGerente={abrirGerenteModal}
                />
              </div>
            </div>
          )}
          {isCaixaAberto(caixaStatus) && (
            <CaixaMovimentacoesTimeline
              m={m}
              idioma={idioma}
              itens={movimentacoes}
              carregando={carregandoMovimentacoes}
              processandoAcao={processandoAcaoMovimentacao}
              onCancelar={handleCancelarMovimentacao}
              onEstornar={handleEstornarMovimentacao}
            />
          )}
          <CaixaFooter
            m={m}
            idioma={idioma}
            layout={pdvLayoutVariant === "classic" ? "classic_summary" : "full"}
            onFinalizar={handleFinalizarClick}
            finalizando={finalizando}
            itensLength={itens.length}
            buscando={buscandoPipeline}
            carregandoRegras={carregandoRegras}
            totalItens={totalItens}
            totalUnidades={totalUnidades}
            gerenteValidadoAte={gerenteValidadoAte}
            descontoGerentePercentual={descontoGerentePercentual}
            maxDescontoGerentePercentual={maxDescontoGerentePercentual}
            totalBruto={totalBruto}
            totalDesconto={totalDesconto}
            economiaPrecoAtacadoAuto={economiaPrecoAtacadoAuto}
            valorDescontoGerente={valorDescontoGerente}
            totalLiquidoComGerente={totalLiquidoComGerente}
            moedaPrefixo={m.caixa.moeda_prefixo}
            metodoPagamentoPanel={
              pdvLayoutVariant === "default" ? metodoPagamentoSelector : undefined
            }
            summaryCollapsed={summaryCollapsed && pdvLayoutVariant !== "classic"}
            onToggleSummaryCollapse={() => setSummaryCollapsed(!summaryCollapsed)}
          />
        </div>
      </div>
      <CaixaToastViewport items={toasts} onDismiss={dismissCaixaToast} />
      {reimprimirModalAberto && lastReciboRef.current && (
        <CaixaReciboModal
          venda={lastReciboRef.current}
          m={m}
          onClose={() => setReimprimirModalAberto(false)}
          onNovaVenda={() => {
            setReimprimirModalAberto(false)
            focarCampoBusca()
          }}
          onFinalizarCaixa={() => {
            setReimprimirModalAberto(false)
            handleFecharCaixaClick()
          }}
          thermal={thermal}
        />
      )}
      {process.env.NODE_ENV === 'development' && pipelineDebug && (
        <CaixaScanPipelineDevPanel
          buscandoPipeline={buscandoPipeline}
          snapshot={pipelineDebug.snapshot}
          telemetryTail={pipelineDebug.telemetryTail}
          activeCupomSessionId={cupomSessionIdRef.current}
        />
      )}
      <CaixaGerenteModal
        open={gerenteModalAberto}
        onOpenChange={setGerenteModalAberto}
        m={m}
        validando={validandoGerente}
        onValidateSenha={handleValidateSenhaGerente}
        onApply={handleAplicarDescontoGerente}
      />
      {movimentacaoModalTipo && (
        <CaixaMovimentacaoModal
          open={!!movimentacaoModalTipo}
          tipo={movimentacaoModalTipo}
          processando={movimentandoCaixa}
          limiteSangriaSemGerente={limiteSangriaSemGerente}
          saldoEstimado={isCaixaAberto(caixaStatus) ? caixaStatus.valorSistemaDinheiro : 0}
          m={m}
          onOpenChange={(open) => {
            if (!open) setMovimentacaoModalTipo(null)
          }}
          onSubmit={handleSalvarMovimentacao}
        />
      )}
      {acaoMovimentacao && (
        <CaixaMovimentacaoAcaoModal
          open={!!acaoMovimentacao}
          tipo={acaoMovimentacao.tipo}
          processando={processandoAcaoMovimentacao}
          m={m}
          onOpenChange={(open) => {
            if (!open) setAcaoMovimentacao(null)
          }}
          onConfirm={handleConfirmarAcaoMovimentacao}
        />
      )}
      {valorNumericoModal && (
        <CaixaValorNumericoModal
          open
          onOpenChange={(open) => {
            if (!open) setValorNumericoModal(null)
          }}
          title={
            valorNumericoModal.fluxo === "abrir_caixa"
              ? m.caixa.modal_valor_titulo_abrir
              : m.caixa.modal_valor_titulo_fechar
          }
          description={
            valorNumericoModal.fluxo === "abrir_caixa"
              ? m.caixa.valor_inicial
              : m.caixa.valor_final
          }
          campoLabel={m.caixa.modal_valor_label}
          placeholder={m.caixa.modal_valor_placeholder}
          initial={valorNumericoModal.initial}
          m={m}
          parseValor={(raw) => parseValorMonetario(raw)}
          mensagemInvalido={
            valorNumericoModal.fluxo === "abrir_caixa"
              ? m.caixa.msg_valor_inicial_invalido
              : m.caixa.msg_valor_contado_invalido
          }
          onConfirm={onConfirmValorNumerico}
        />
      )}
      {motivoFecharModal && (
        <CaixaMotivoMinModal
          open
          onOpenChange={(open) => {
            if (!open) setMotivoFecharModal(null)
          }}
          title={
            motivoFecharModal.tipo === "diferenca"
              ? m.caixa.modal_motivo_diferenca_titulo
              : m.caixa.modal_motivo_blind_titulo
          }
          description={
            motivoFecharModal.tipo === "diferenca"
              ? caixaFmt(m.caixa.modal_motivo_diferenca_desc, {
                  diferenca: motivoFecharModal.diferencaFmt,
                })
              : m.caixa.modal_motivo_blind_desc
          }
          m={m}
          onConfirm={onConfirmMotivoFechar}
        />
      )}
      <CaixaConfirmModal
        open={confirmacaoPendente !== null}
        title={
          confirmacaoPendente?.tipo === "sangria"
            ? m.caixa.modal_confirmacao_sangria_titulo
            : confirmacaoPendente?.tipo === "cancelar"
              ? m.caixa.modal_confirmacao_cancelar_titulo
              : m.caixa.modal_confirmacao_estorno_titulo
        }
        description={
          confirmacaoPendente?.tipo === "sangria"
            ? m.caixa.confirmar_sangria_curta
            : confirmacaoPendente?.tipo === "cancelar"
              ? m.caixa.confirmar_cancelamento_curto
              : m.caixa.confirmar_estorno_curto
        }
        m={m}
        initialFocus="cancel"
        onOpenChange={(open) => {
          if (!open) setConfirmacaoPendente(null)
        }}
        onConfirm={handleConfirmarAcaoSensivel}
      />
    </>
  )
}