"use client"

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import {
  calcularPrecoProdutoCaixa,
  finalizarVendaCaixa,
  abrirCaixaOperador,
  fecharCaixaOperador,
  validarGerenteDesconto,
} from "@/app/caixa/actions"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import { roundMoney2, type FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import { aplicarDescontoGerenteSobreTotal } from "@/stores/managerDiscount"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { useCaixaMensagens } from "@/app/caixa/hooks/useCaixaMensagens"
import { useCaixaPagamentos } from "@/app/caixa/hooks/useCaixaPagamentos"
import { useCaixaStatusMovimentacoes } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { useCaixaBootstrapData } from "@/app/caixa/hooks/useCaixaBootstrapData"
import { useCaixaKeyboardShortcuts } from "@/app/caixa/hooks/useCaixaKeyboardShortcuts"
import { useCaixaGerenteTokenExpiry } from "@/app/caixa/hooks/useCaixaGerenteTokenExpiry"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { CaixaHeader } from "@/app/caixa/CaixaHeader"
import { CaixaSearchBar } from "@/app/caixa/CaixaSearchBar"
import { CaixaOperadorContextBar } from "@/app/caixa/CaixaOperadorContextBar"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import { CaixaFooter } from "@/app/caixa/CaixaFooter"
import { CaixaPdvCartSaleBar } from "@/app/caixa/CaixaPdvCartSaleBar"
import { CaixaPdvOperacoesButtons } from "@/app/caixa/CaixaPdvOperacoesButtons"
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
import { CaixaScanPipelineDevPanel } from "@/app/caixa/scan-pipeline/CaixaScanPipelineDevPanel"
import { CaixaPdvLayoutPreviewBanner } from "@/app/caixa/CaixaPdvLayoutPreviewBanner"
import { CaixaPdvItemStagingPlaceholder } from "@/app/caixa/CaixaPdvItemStagingPlaceholder"
import { CaixaPdvMetodoPagamentoSelector } from "@/app/caixa/CaixaPdvMetodoPagamentoSelector"
import {
  metodoPagamentoToForma,
  type MetodoPagamentoUi,
} from "@/app/caixa/caixaMetodoPagamento"
import {
  CaixaPdvOperadorTabs,
  type CaixaPdvOperadorTabId,
} from "@/app/caixa/CaixaPdvOperadorTabs"
import type { CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"
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

function localeFromIdioma(idioma: Idioma): string {
  if (idioma === "pt") return "pt-BR"
  return "zh-CN"
}

type Props = {
  messages: Mensagens
  idioma: Idioma
  operadorLabel: string
  perfil: string
}

export function CaixaPageClient({ messages: m, idioma, operadorLabel, perfil }: Props) {
  const pdvLayoutVariant: CaixaPdvLayoutVariant =
    process.env.NEXT_PUBLIC_CAIXA_PDV_LAYOUT === "classic" ? "classic" : "default"

  const {
    mensagem,
    msgVendaOk,
    toasts,
    setCaixaMensagem,
    setCaixaMensagemVendaOk,
    dismissCaixaToast,
  } = useCaixaMensagens()

  const [codigo, setCodigo] = useState("")
  const [carregandoRegras, setCarregandoRegras] = useState(true)
  const [limiteSangriaSemGerente, setLimiteSangriaSemGerente] = useState(200)
  const [finalizando, setFinalizando] = useState(false)
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
  const [categoriasAtalho, setCategoriasAtalho] = useState<{ id: string; nome: string }[]>([])
  const [configCaixaWeb, setConfigCaixaWeb] = useState<Record<string, string>>({})
  const [somFeedbackAtivo, setSomFeedbackAtivo] = useState(false)
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
    movimentacoes,
    carregandoMovimentacoes,
    movimentandoCaixa,
    processandoAcaoMovimentacao,
    recarregarStatusCaixa,
    handleSalvarMovimentacao,
    handleConfirmarAcaoMovimentacao,
  } = useCaixaStatusMovimentacoes({ m, setCaixaMensagem, movimentacaoModalTipo, acaoMovimentacao })

  const {
    itens,
    totalBruto,
    totalDesconto,
    totalLiquido,
    totalItens,
    totalUnidades,
    setRegras,
    setCartOwnerForSession,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    limparCarrinho,
  } = useCarrinhoStore()

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
  /** UUID estável entre duplo clique / retry; zera após venda OK ou «Novo cupom». Só usado com `USE_UNIFIED_SALES_FLOW` no servidor. */
  const vendaIdempotenciaRef = useRef<string | null>(null)

  const cupomSessionIdRef = useRef<string>(newCupomSessionId())

  const focarCampoBusca = useCallback(() => {
    requestAnimationFrame(() => {
      buscaInputRef.current?.focus()
    })
  }, [])

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

  const aplicarPrecoRpcParaLinha = useCallback(
    async (
      params: { produtoId: string; itemId: string; quantidade: number },
      opts?: { scanSignal?: AbortSignal },
    ) => {
      const linha = useCarrinhoStore.getState().itens.find((i) => i.id === params.itemId)
      if (!linha || linha.produtoId !== params.produtoId) return
      const tp = linha.resultado?.tipoPreco
      if (tp === "MANUAL" || tp === "PROMOCAO") return

      const res = await calcularPrecoProdutoCaixa({
        produtoId: params.produtoId,
        quantidade: params.quantidade,
      })
      if (opts?.scanSignal?.aborted) return
      if (!res.ok) {
        setCaixaMensagem(res.error, { kind: "error" })
        return
      }
      if (opts?.scanSignal?.aborted) return
      useCarrinhoStore.getState().sincronizarPrecoCalculadoRpc(params.itemId, {
        precoUnitario: res.preco,
        tipoPreco: res.tipo,
      })
    },
    [setCaixaMensagem],
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
    aplicarPrecoRpcParaLinha,
    getActiveCupomSessionId: () => cupomSessionIdRef.current,
  })

  const pagamentoControlesDesabilitados =
    finalizando || buscandoPipeline || carregandoRegras

  const metodoPagamentoSelector = (
    <CaixaPdvMetodoPagamentoSelector
      m={m}
      value={metodoPagamento}
      onChange={setMetodoPagamento}
      disabled={pagamentoControlesDesabilitados}
      variant={pdvLayoutVariant === "classic" ? "classic" : "default"}
    />
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
    setCategoriasAtalho,
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
      [enqueueLeitura, m.caixa.msg_fila_leituras_cheia, setCaixaMensagem],
    ),
    {
      enabled: true,
      maxIntervalMs: 40,
      flushTimeoutMs: 100,
      minLength: 3,
    },
  )

  const handleAlterarQuantidade = useCallback(
    async (itemId: string, quantidade: number) => {
      if (Number.isNaN(quantidade)) return
      if (quantidade <= 0) {
        removerItem(itemId)
        setCaixaMensagem(m.caixa.msg_item_removido_qtde_zero, { kind: "info" })
        return
      }
      const antes = useCarrinhoStore.getState().itens.find((i) => i.id === itemId)
      const tpAntes = antes?.resultado?.tipoPreco
      if (tpAntes === "MANUAL" || tpAntes === "PROMOCAO") {
        alterarQuantidade(itemId, quantidade)
        return
      }
      alterarQuantidade(itemId, quantidade)
      const depois = useCarrinhoStore.getState().itens.find((i) => i.id === itemId)
      if (!depois) return
      await aplicarPrecoRpcParaLinha({
        produtoId: depois.produtoId,
        itemId: depois.id,
        quantidade: depois.quantidade,
      })
    },
    [
      alterarQuantidade,
      aplicarPrecoRpcParaLinha,
      m.caixa.msg_item_removido_qtde_zero,
      removerItem,
      setCaixaMensagem,
    ],
  )

  const handleRemover = useCallback(
    (itemId: string) => {
      removerItem(itemId)
    },
    [removerItem],
  )

  const handleNovoCupom = useCallback(() => {
    vendaIdempotenciaRef.current = null
    flushLeiturasPendentes({ reason: "new_cupom" })
    cupomSessionIdRef.current = newCupomSessionId()
    limparCarrinho()
    resetPagamentos()
    setMetodoPagamento("dinheiro")
    setCodigo("")
    setCaixaMensagem(null)
    limparEstadoDescontoGerente()
    setAbaPdvAtiva("produto")
  }, [
    flushLeiturasPendentes,
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
        const blind = caixaStatus?.aberto === true && caixaStatus.blindClosureEnabled
        if (!res.ok && blind && erroExigeMotivoFechamento(res.error) && motivo == null) {
          setMotivoFecharModal({ tipo: "blind_retry", valorContado })
          return
        }
        if (!res.ok) {
          setCaixaMensagem(res.error, { kind: "error" })
          tocarFeedback("erro")
          return
        }
        const diferencaPrefixo = res.diferenca > 0 ? "+" : ""
        setCaixaMensagem(
          `Caixa fechado. Sistema: R$ ${res.valorSistemaDinheiro.toFixed(2)} · Contado: R$ ${res.valorContado.toFixed(2)} · Diferença: ${diferencaPrefixo}R$ ${res.diferenca.toFixed(2)}`,
          { kind: "success" },
        )
        tocarFeedback("ok")
        await recarregarStatusCaixa()
      } finally {
        setProcessandoCaixa(false)
      }
    },
    [caixaStatus, erroExigeMotivoFechamento, recarregarStatusCaixa, setCaixaMensagem, tocarFeedback],
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
            setCaixaMensagem(`Caixa aberto (${res.caixaId.slice(0, 8)}…).`, { kind: "success" })
            tocarFeedback("ok")
            await recarregarStatusCaixa()
          } finally {
            setProcessandoCaixa(false)
          }
        })()
        return
      }
      const aberto = caixaStatus?.aberto === true
      const blind = aberto && caixaStatus.blindClosureEnabled
      const valorSistemaDinheiro = aberto ? caixaStatus.valorSistemaDinheiro : 0
      const diferencaEstimada = aberto ? roundMoney2(v - valorSistemaDinheiro) : null
      if (!blind && diferencaEstimada !== null && Math.abs(diferencaEstimada) > 5) {
        setMotivoFecharModal({
          tipo: "diferenca",
          valorContado: v,
          diferencaFmt: diferencaEstimada.toFixed(2),
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
      !['GERENTE', 'DONO', 'ADMIN'].includes(perfil)
    ) {
      const motivo = configCaixaWeb.motivo_suspensao?.trim()
      setCaixaMensagem(
        motivo ? `Vendas suspensas: ${motivo}` : 'Vendas suspensas pelo gerente.',
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
          esperado: totalLiquidoComGerente.toFixed(2),
          informado: totalPagamentos.toFixed(2),
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
    setFinalizando(true)
    setCaixaMensagem(null)
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
        pagamentos: parcelasFiltradas,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoOriginal: i.resultado?.precoOriginal ?? i.precoOriginal ?? 0,
          precoUnitario: i.resultado?.precoUnitario ?? i.precoUnitario ?? 0,
          tipoPreco: i.resultado?.tipoPreco ?? "VAREJO",
        })),
      }
      const res = await finalizarVendaCaixa(payload)
      if (res.ok) {
        vendaIdempotenciaRef.current = null
        limparCarrinho()
        limparEstadoDescontoGerente()
        resetPagamentos()
        setCaixaMensagemVendaOk(
          caixaFmt(m.caixa.msg_venda_ok, { id: res.vendaId.slice(0, 8) }),
          { kind: "success" },
        )
        tocarFeedback("ok")
        await recarregarStatusCaixa()
      } else {
        setCaixaMensagem(res.error, { kind: "error" })
        tocarFeedback("erro")
      }
    } catch {
      setCaixaMensagem(m.caixa.msg_falha_finalizar, { kind: "error" })
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
    caixaAberto: caixaStatus?.aberto === true,
    movimentandoCaixa,
    onAbrirSuprimento: handleAbrirSuprimento,
    onAbrirSangria: handleAbrirSangria,
    onFinalizar: () => void handleFinalizar(),
    onFecharCaixa: () => void handleFecharCaixa(),
    onFocarBusca: focarCampoBusca,
    onNovoCupom: handleNovoCupom,
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

  return (
    <>
      <div
        data-caixa-layout={pdvLayoutVariant === "classic" ? "classic" : undefined}
        className={cn(
          "min-h-[100dvh] flex flex-col text-[14px] leading-5",
          pdvLayoutVariant === "classic" ? "bg-background text-foreground" : "caixa-oriental-root",
        )}
      >
        <CaixaHeader
          m={m}
          idioma={idioma}
          layoutVariant={pdvLayoutVariant}
          operadorLabel={operadorLabel}
          carregandoRegras={carregandoRegras}
          caixaStatus={caixaStatus}
          processandoCaixa={processandoCaixa}
          onAbrirCaixa={() => void handleAbrirCaixa()}
          onFecharCaixa={() => void handleFecharCaixa()}
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
                          categoriasAtalho={categoriasAtalho}
                          somAtivo={somFeedbackAtivo}
                          onToggleSom={() => setSomFeedbackAtivo((prev) => !prev)}
                          hideNovoCupom
                          compact={codigo.trim().length > 0}
                        />
                      </div>
                      <CaixaPdvItemStagingPlaceholder
                        m={m}
                        dense={codigo.trim().length > 0}
                      />
                      <div className="shrink-0">
                        <CaixaMessageBanner mensagem={mensagem} msgVendaOk={msgVendaOk} />
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
                        categoriasAtalho={categoriasAtalho}
                        somAtivo={somFeedbackAtivo}
                        onToggleSom={() => setSomFeedbackAtivo((prev) => !prev)}
                      />
                      <CaixaMessageBanner mensagem={mensagem} msgVendaOk={msgVendaOk} />
                    </>
                  )
                }
              />
            </div>
            <section className="flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card md:min-h-0">
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
                  idioma={idioma}
                  onExcluirVenda={handleNovoCupom}
                  onFinalizar={() => void handleFinalizar()}
                  finalizando={finalizando}
                  movimentandoCaixa={movimentandoCaixa}
                  caixaAberto={caixaStatus?.aberto === true}
                  itensLength={itens.length}
                  buscando={buscandoPipeline}
                  carregandoRegras={carregandoRegras}
                  totalLiquidoComGerente={totalLiquidoComGerente}
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
                  : "border-border bg-card/90",
              )}
            >
              <button
                type="button"
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-center text-sm font-semibold disabled:pointer-events-none disabled:opacity-50",
                  pdvLayoutVariant === "classic"
                    ? "border-border bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/90",
                )}
                onClick={handleNovoCupom}
                disabled={carregandoRegras}
              >
                {m.caixa.novo_cupom}
              </button>
              <div
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {m.caixa.rail_titulo_nova_venda}
              </div>
              <div
                className="border-t border-border pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {m.caixa.rail_titulo_operacoes}
              </div>
              {pdvLayoutVariant === "classic" ? (
                <CaixaPdvOperacoesButtons
                  m={m}
                  idioma={idioma}
                  variant="classic"
                  carregandoRegras={carregandoRegras}
                  caixaStatus={caixaStatus}
                  caixaAberto={caixaStatus?.aberto === true}
                  movimentandoCaixa={movimentandoCaixa}
                  finalizando={finalizando}
                  validandoGerente={validandoGerente}
                  gerenteValidadoAte={gerenteValidadoAte}
                  onAbrirSuprimento={handleAbrirSuprimento}
                  onAbrirSangria={handleAbrirSangria}
                  onValidarGerente={() => setGerenteModalAberto(true)}
                />
              ) : (
                <p className="text-xs text-muted-foreground leading-snug">{m.caixa.rail_placeholder}</p>
              )}
              <div
                className="border-t border-border pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {m.caixa.rail_titulo_em_aberto}
              </div>
              <p
                className="text-xs leading-snug text-muted-foreground"
              >
                {m.caixa.rail_placeholder}
              </p>
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
                  caixaAberto={caixaStatus?.aberto === true}
                  movimentandoCaixa={movimentandoCaixa}
                  finalizando={finalizando}
                  validandoGerente={validandoGerente}
                  gerenteValidadoAte={gerenteValidadoAte}
                  onAbrirSuprimento={handleAbrirSuprimento}
                  onAbrirSangria={handleAbrirSangria}
                  onValidarGerente={() => setGerenteModalAberto(true)}
                />
              </div>
            </div>
          )}
          {caixaStatus?.aberto && (
            <CaixaMovimentacoesTimeline
              m={m}
              idioma={idioma}
              itens={movimentacoes}
              carregando={carregandoMovimentacoes}
              processandoAcao={processandoAcaoMovimentacao}
              onCancelar={(item) => {
                setConfirmacaoPendente({ tipo: "cancelar", item })
              }}
              onEstornar={(item) => {
                setConfirmacaoPendente({ tipo: "estornar", item })
              }}
            />
          )}
          <CaixaFooter
            m={m}
            idioma={idioma}
            layout={pdvLayoutVariant === "classic" ? "classic_summary" : "full"}
            onValidarGerente={() => setGerenteModalAberto(true)}
            onAbrirSuprimento={handleAbrirSuprimento}
            onAbrirSangria={handleAbrirSangria}
            onFinalizar={() => void handleFinalizar()}
            validandoGerente={validandoGerente}
            finalizando={finalizando}
            movimentandoCaixa={movimentandoCaixa}
            caixaAberto={caixaStatus?.aberto === true}
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
          />
        </div>
      </div>
      <CaixaToastViewport items={toasts} onDismiss={dismissCaixaToast} />
      {pipelineDebug && (
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
          saldoEstimado={caixaStatus?.aberto ? caixaStatus.valorSistemaDinheiro : 0}
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