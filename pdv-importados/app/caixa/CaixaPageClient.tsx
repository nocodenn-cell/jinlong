"use client"

import { useCallback, useRef, useState, type FormEvent } from "react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import {
  buscarProdutoParaCaixa,
  finalizarVendaCaixa,
  abrirCaixaOperador,
  fecharCaixaOperador,
  validarGerenteDesconto,
} from "@/app/caixa/actions"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import { roundMoney2, type FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
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
import { createClient } from "@/lib/supabase/client"
import { useScannerDetector } from "@/hooks/useScannerDetector"
import "@/styles/theme-oriental.css"

function localeFromIdioma(idioma: Idioma): string {
  if (idioma === "pt") return "pt-BR"
  return "zh-CN"
}

type Props = {
  messages: Mensagens
  idioma: Idioma
}

export function CaixaPageClient({ messages: m, idioma }: Props) {
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
  const [buscando, setBuscando] = useState(false)
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
  const [somFeedbackAtivo, setSomFeedbackAtivo] = useState(false)
  const [confirmacaoPendente, setConfirmacaoPendente] = useState<
    | null
    | { tipo: "sangria" }
    | { tipo: "cancelar"; item: MovimentacaoCaixaDTO }
    | { tipo: "estornar"; item: MovimentacaoCaixaDTO }
  >(null)

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

  const valorDescontoGerente =
    descontoGerentePercentual > 0
      ? roundMoney2((totalLiquido * descontoGerentePercentual) / 100)
      : 0
  const totalLiquidoComGerente = roundMoney2(totalLiquido - valorDescontoGerente)

  const {
    pagamentos,
    handlePagamentoFormaChange,
    handlePagamentoValorChange,
    handleAdicionarPagamento,
    handleRemoverPagamento,
    resetPagamentos,
  } = useCaixaPagamentos(totalLiquidoComGerente)

  const loc = localeFromIdioma(idioma)
  const buscaInputRef = useRef<HTMLInputElement>(null)
  /** UUID estável entre duplo clique / retry; zera após venda OK ou «Novo cupom». Só usado com `USE_UNIFIED_SALES_FLOW` no servidor. */
  const vendaIdempotenciaRef = useRef<string | null>(null)

  const focarCampoBusca = useCallback(() => {
    requestAnimationFrame(() => {
      buscaInputRef.current?.focus()
    })
  }, [])

  const handleAdicionarCodigo = useCallback(
    async (rawCodigo: string) => {
      const trimmed = rawCodigo.trim()
      if (!trimmed) return

      setBuscando(true)
      setCaixaMensagem(null)

      try {
        const res = await buscarProdutoParaCaixa(trimmed)

        if (!res.ok) {
          setCaixaMensagem(res.error, { kind: "error" })
          tocarFeedback("erro")
          return
        }

        if (res.status === "nao_encontrado") {
          setCaixaMensagem(m.caixa.msg_produto_nao_encontrado_acao, { kind: "warning" })
          tocarFeedback("erro")
          return
        }

        if (res.status === "ambiguo") {
          setCaixaMensagem(res.mensagem, { kind: "warning" })
          tocarFeedback("erro")
          return
        }

        const p = res.produto
        const q = p.quantidade_estoque
        const min = p.estoque_minimo
        let avisoEstoqueMsg: string | null = null
        if (q !== null && q < 1) {
          avisoEstoqueMsg = `${m.caixa.item_adicionado} ${m.caixa.estoque_baixo}`
        } else if (q !== null && min !== null && q <= min) {
          avisoEstoqueMsg = `${m.caixa.item_adicionado} ${m.caixa.estoque_abaixo_minimo} ${m.caixa.estoque_dica_rep}`
        }

        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const uid = session?.user?.id ?? null
        if (uid) {
          setCartOwnerForSession(uid)
        }

        adicionarItem({
          id: `${p.id}-${Date.now()}`,
          produtoId: p.id,
          nome: p.nome,
          quantidade: 1,
          precoUnitario: p.preco_varejo,
          precoOriginal: p.preco_varejo,
          resultado: {
            precoUnitario: p.preco_varejo,
            precoOriginal: p.preco_varejo,
            descontoUnitario: 0,
            tipoPreco: "VAREJO",
          },
          metaPdv: {
            origem: p.origem,
            tem_nf: p.tem_nf,
            observacao: p.observacao,
            estoque_atual: p.quantidade_estoque,
            estoque_minimo: p.estoque_minimo,
            categoriaId: p.categoria_id,
            precoAtacado: p.preco_atacado,
          },
        })

        setCodigo("")
        if (avisoEstoqueMsg) {
          setCaixaMensagem(avisoEstoqueMsg, { kind: "warning" })
        } else {
          setCaixaMensagem(m.caixa.msg_item_adicionado_toast, { kind: "success" })
        }
        tocarFeedback("ok")
      } catch {
        setCaixaMensagem(m.caixa.falha_busca, { kind: "error" })
        tocarFeedback("erro")
      } finally {
        setBuscando(false)
        focarCampoBusca()
      }
    },
    [adicionarItem, focarCampoBusca, m, setCaixaMensagem, setCartOwnerForSession],
  )

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
  })

  const handleAdicionar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      await handleAdicionarCodigo(codigo)
    },
    [codigo, handleAdicionarCodigo],
  )

  useScannerDetector(
    useCallback(
      (scannedCode: string) => {
        setCaixaMensagem(`Código lido: ${scannedCode}`, { kind: "info" })
        void handleAdicionarCodigo(scannedCode)
      },
      [handleAdicionarCodigo, setCaixaMensagem],
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
      alterarQuantidade(itemId, quantidade)
    },
    [alterarQuantidade, m.caixa.msg_item_removido_qtde_zero, removerItem, setCaixaMensagem],
  )

  const handleRemover = useCallback(
    (itemId: string) => {
      removerItem(itemId)
    },
    [removerItem],
  )

  const handleNovoCupom = useCallback(() => {
    vendaIdempotenciaRef.current = null
    limparCarrinho()
    resetPagamentos()
    setCodigo("")
    setCaixaMensagem(null)
    limparEstadoDescontoGerente()
  }, [limparCarrinho, limparEstadoDescontoGerente, resetPagamentos, setCaixaMensagem])

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
    [caixaStatus, erroExigeMotivoFechamento, recarregarStatusCaixa, setCaixaMensagem],
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
    [valorNumericoModal, caixaStatus, executarFecharCaixa, recarregarStatusCaixa, setCaixaMensagem],
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
    if (gerenteValidadoAte && Date.now() >= Date.parse(gerenteValidadoAte)) {
      limparEstadoDescontoGerente()
      setCaixaMensagem(m.caixa.msg_token_expirado, { kind: "warning" })
      return
    }
    const totalPagamentos = roundMoney2(
      pagamentos.reduce((acc, pagamento) => acc + pagamento.valor, 0),
    )
    if (Math.abs(totalPagamentos - totalLiquidoComGerente) > 0.01) {
      setCaixaMensagem(
        caixaFmt(m.caixa.msg_pagamento_split_invalido, {
          esperado: totalLiquidoComGerente.toFixed(2),
          informado: totalPagamentos.toFixed(2),
        }),
        { kind: "warning" },
      )
      return
    }
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
          descontoGerentePercentual > 0
            ? roundMoney2(totalDesconto + (totalLiquido * descontoGerentePercentual) / 100)
            : totalDesconto,
        totalLiquido:
          descontoGerentePercentual > 0
            ? roundMoney2(totalLiquido - (totalLiquido * descontoGerentePercentual) / 100)
            : totalLiquido,
        descontoGerenteToken:
          descontoGerentePercentual > 0 ? gerenteToken ?? undefined : undefined,
        descontoGerentePercentual:
          descontoGerentePercentual > 0 ? descontoGerentePercentual : undefined,
        pagamentos: pagamentos.map((p) => ({
          formaPagamento: p.formaPagamento,
          valor: p.valor,
        })),
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
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
    descontoGerentePercentual,
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
  ])

  useCaixaGerenteTokenExpiry({
    gerenteValidadoAte,
    onExpire: useCallback(() => {
      limparEstadoDescontoGerente()
      setCaixaMensagem(m.caixa.msg_token_expirado, { kind: "warning" })
    }, [limparEstadoDescontoGerente, m.caixa.msg_token_expirado, setCaixaMensagem]),
  })

  useCaixaKeyboardShortcuts({
    caixaAberto: caixaStatus?.aberto === true,
    movimentandoCaixa,
    onAbrirSuprimento: handleAbrirSuprimento,
    onAbrirSangria: handleAbrirSangria,
    onFinalizar: () => void handleFinalizar(),
    onFecharCaixa: () => void handleFecharCaixa(),
    onFocarBusca: focarCampoBusca,
    onNovoCupom: handleNovoCupom,
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
      <div className="min-h-[100dvh] caixa-oriental-root flex flex-col text-[14px] leading-5">
        <CaixaHeader
          m={m}
          idioma={idioma}
          carregandoRegras={carregandoRegras}
          caixaStatus={caixaStatus}
          processandoCaixa={processandoCaixa}
          onAbrirCaixa={() => void handleAbrirCaixa()}
          onFecharCaixa={() => void handleFecharCaixa()}
        />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 px-4 sm:px-6 pt-4 pb-2 space-y-3">
            <CaixaOperadorContextBar m={m} idioma={idioma} />
            <CaixaSearchBar
              ref={buscaInputRef}
              m={m}
              codigo={codigo}
              onCodigoChange={setCodigo}
              onSubmit={handleAdicionar}
              onNovoCupom={handleNovoCupom}
              buscando={buscando}
              carregandoRegras={carregandoRegras}
              categoriasAtalho={categoriasAtalho}
              somAtivo={somFeedbackAtivo}
              onToggleSom={() => setSomFeedbackAtivo((prev) => !prev)}
            />
            <CaixaMessageBanner mensagem={mensagem} msgVendaOk={msgVendaOk} />
          </div>
          <section className="flex-1 min-h-0 flex flex-col mx-4 sm:mx-6 rounded-xl border border-border bg-card overflow-hidden mb-2">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <CaixaCartList
                m={m}
                idioma={idioma}
                itens={itens}
                moeda={m.caixa.moeda_prefixo}
                onAlterarQuantidade={handleAlterarQuantidade}
                onRemover={handleRemover}
              />
            </div>
          </section>
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
            pagamentos={pagamentos}
            onPagamentoFormaChange={handlePagamentoFormaChange}
            onPagamentoValorChange={handlePagamentoValorChange}
            onAdicionarPagamento={handleAdicionarPagamento}
            onRemoverPagamento={handleRemoverPagamento}
            onValidarGerente={() => setGerenteModalAberto(true)}
            onAbrirSuprimento={handleAbrirSuprimento}
            onAbrirSangria={handleAbrirSangria}
            onFinalizar={() => void handleFinalizar()}
            validandoGerente={validandoGerente}
            finalizando={finalizando}
            movimentandoCaixa={movimentandoCaixa}
            caixaAberto={caixaStatus?.aberto === true}
            itensLength={itens.length}
            buscando={buscando}
            carregandoRegras={carregandoRegras}
            totalItens={totalItens}
            totalUnidades={totalUnidades}
            gerenteValidadoAte={gerenteValidadoAte}
            descontoGerentePercentual={descontoGerentePercentual}
            maxDescontoGerentePercentual={maxDescontoGerentePercentual}
            totalBruto={totalBruto}
            totalDesconto={totalDesconto}
            valorDescontoGerente={valorDescontoGerente}
            totalLiquidoComGerente={totalLiquidoComGerente}
            moedaPrefixo={m.caixa.moeda_prefixo}
          />
        </div>
      </div>
      <CaixaToastViewport items={toasts} onDismiss={dismissCaixaToast} />
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
