"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import {
  carregarRegrasPrecoCaixa,
  buscarProdutoParaCaixa,
  finalizarVendaCaixa,
  abrirCaixaOperador,
  fecharCaixaOperador,
  obterStatusCaixaOperador,
  validarGerenteDesconto,
  obterLimiteSangriaSemGerente,
  registrarMovimentacao,
  autorizarMovimentacaoGerente,
  obterMovimentacoesCaixa,
  cancelarMovimentacaoCaixa,
  estornarMovimentacaoCaixa,
  type MovimentacaoCaixaDTO,
} from "@/app/caixa/actions"
import { DEFAULT_PRICING_CONTEXT } from "@/core/pricing"
import { roundMoney2, type FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import type { Idioma } from "@/src/lib/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { CaixaHeader } from "@/app/caixa/CaixaHeader"
import { CaixaSearchBar } from "@/app/caixa/CaixaSearchBar"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import { CaixaFooter } from "@/app/caixa/CaixaFooter"
import {
  CaixaGerenteModal,
  type ValidarSenhaGerenteResult,
} from "@/app/caixa/CaixaGerenteModal"
import {
  CaixaMovimentacaoModal,
  type TipoMovimentacaoUi,
} from "@/app/caixa/CaixaMovimentacaoModal"
import {
  CaixaMovimentacaoAcaoModal,
  type AcaoMovimentacaoTipo,
} from "@/app/caixa/CaixaMovimentacaoAcaoModal"
import { CaixaMovimentacoesTimeline } from "@/app/caixa/CaixaMovimentacoesTimeline"

function localeFromIdioma(idioma: Idioma): string {
  if (idioma === "pt") return "pt-BR"
  if (idioma === "zh-HK") return "zh-HK"
  return "zh-CN"
}

type Props = {
  messages: Mensagens
  idioma: Idioma
}

export function CaixaPageClient({ messages: m, idioma }: Props) {
  const [codigo, setCodigo] = useState("")
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [carregandoRegras, setCarregandoRegras] = useState(true)
  const [limiteSangriaSemGerente, setLimiteSangriaSemGerente] = useState(200)
  const [buscando, setBuscando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [processandoCaixa, setProcessandoCaixa] = useState(false)
  const [validandoGerente, setValidandoGerente] = useState(false)
  const [movimentandoCaixa, setMovimentandoCaixa] = useState(false)
  const [carregandoMovimentacoes, setCarregandoMovimentacoes] = useState(false)
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoCaixaDTO[]>([])
  const [processandoAcaoMovimentacao, setProcessandoAcaoMovimentacao] = useState(false)
  const [gerenteModalAberto, setGerenteModalAberto] = useState(false)
  const [movimentacaoModalTipo, setMovimentacaoModalTipo] =
    useState<TipoMovimentacaoUi | null>(null)
  const [acaoMovimentacao, setAcaoMovimentacao] = useState<{
    tipo: AcaoMovimentacaoTipo
    item: MovimentacaoCaixaDTO
  } | null>(null)
  const [gerenteValidadoAte, setGerenteValidadoAte] = useState<string | null>(null)
  const [gerenteToken, setGerenteToken] = useState<string | null>(null)
  const [maxDescontoGerentePercentual, setMaxDescontoGerentePercentual] =
    useState<number>(0)
  const [descontoGerentePercentual, setDescontoGerentePercentual] =
    useState<number>(0)
  const [pagamentos, setPagamentos] = useState<
    Array<{ formaPagamento: FinalizarVendaInput["formaPagamento"]; valor: number }>
  >([{ formaPagamento: "DINHEIRO", valor: 0 }])
  const [caixaStatus, setCaixaStatus] = useState<
    | {
        aberto: true
        caixaId: string
        dataAbertura: string
        valorInicial: number
        valorSistemaDinheiro: number
        blindClosureEnabled: boolean
      }
    | { aberto: false }
    | null
  >(null)

  const {
    itens,
    totalBruto,
    totalDesconto,
    totalLiquido,
    totalItens,
    totalUnidades,
    setRegras,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    limparCarrinho,
  } = useCarrinhoStore()

  const loc = localeFromIdioma(idioma)
  const buscaInputRef = useRef<HTMLInputElement>(null)
  /** UUID estável entre duplo clique / retry; zera após venda OK ou «Novo cupom». Só usado com `USE_UNIFIED_SALES_FLOW` no servidor. */
  const vendaIdempotenciaRef = useRef<string | null>(null)

  const focarCampoBusca = useCallback(() => {
    requestAnimationFrame(() => {
      buscaInputRef.current?.focus()
    })
  }, [])

  const limparEstadoDescontoGerente = useCallback(() => {
    setGerenteValidadoAte(null)
    setGerenteToken(null)
    setMaxDescontoGerentePercentual(0)
    setDescontoGerentePercentual(0)
  }, [])

  const recarregarMovimentacoes = useCallback(async (caixaId?: string) => {
    if (!caixaId) {
      setMovimentacoes([])
      return
    }
    setCarregandoMovimentacoes(true)
    try {
      const res = await obterMovimentacoesCaixa(caixaId)
      if (!res.ok) {
        setMensagem(res.error)
        return
      }
      setMovimentacoes(res.itens)
    } finally {
      setCarregandoMovimentacoes(false)
    }
  }, [])

  const recarregarStatusCaixa = useCallback(async () => {
    const status = await obterStatusCaixaOperador()
    if (!status.ok) {
      setMensagem(status.error)
      return
    }
    if (status.aberto) {
      setCaixaStatus({
        aberto: true,
        caixaId: status.caixaId,
        dataAbertura: status.dataAbertura,
        valorInicial: status.valorInicial,
        valorSistemaDinheiro: status.valorSistemaDinheiro,
        blindClosureEnabled: status.blindClosureEnabled,
      })
      await recarregarMovimentacoes(status.caixaId)
    } else {
      setCaixaStatus({ aberto: false })
      setMovimentacoes([])
    }
  }, [recarregarMovimentacoes])

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCarregandoRegras(true)
      const res = await carregarRegrasPrecoCaixa()
      if (cancelado) return
      if (res.ok) {
        setRegras(res.regras, res.pricingContext)
        setMensagem(null)
      } else {
        setMensagem(`${m.caixa.regras_erro_prefixo} ${res.error}`)
        setRegras([], DEFAULT_PRICING_CONTEXT)
      }
      setCarregandoRegras(false)
    })()
    return () => {
      cancelado = true
    }
  }, [setRegras, m.caixa.regras_erro_prefixo])

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const res = await obterLimiteSangriaSemGerente()
      if (cancelado) return
      if (res.ok) {
        setLimiteSangriaSemGerente(res.limite)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => {
    void recarregarStatusCaixa()
  }, [recarregarStatusCaixa])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey)) return
      if (e.repeat) return
      if (e.code === "KeyS") {
        e.preventDefault()
        if (!movimentandoCaixa && caixaStatus?.aberto) setMovimentacaoModalTipo("suprimento")
      } else if (e.code === "KeyR") {
        e.preventDefault()
        if (!movimentandoCaixa && caixaStatus?.aberto) setMovimentacaoModalTipo("sangria")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [movimentandoCaixa, caixaStatus])

  const handleAdicionar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = codigo.trim()
      if (!trimmed) return

      setBuscando(true)
      setMensagem(null)

      try {
        const res = await buscarProdutoParaCaixa(trimmed)

        if (!res.ok) {
          setMensagem(res.error)
          setBuscando(false)
          return
        }

        if (res.status === "nao_encontrado") {
          setMensagem(m.caixa.produto_nao_encontrado)
          setBuscando(false)
          return
        }

        if (res.status === "ambiguo") {
          setMensagem(res.mensagem)
          setBuscando(false)
          return
        }

        const p = res.produto
        const avisoEstoque =
          p.quantidade_estoque !== null && p.quantidade_estoque < 1
            ? m.caixa.estoque_baixo
            : ""

        adicionarItem({
          id: `${p.id}-${Date.now()}`,
          produtoId: p.id,
          nome: p.nome,
          quantidade: 1,
          precoVariejo: p.preco_varejo,
          precoAtacado: p.preco_atacado,
          categoriaId: p.categoria_id ?? undefined,
        })

        setCodigo("")
        if (avisoEstoque) {
          setMensagem(`${m.caixa.item_adicionado} ${avisoEstoque}`)
        } else {
          setMensagem(null)
        }
      } catch {
        setMensagem(m.caixa.falha_busca)
      } finally {
        setBuscando(false)
        focarCampoBusca()
      }
    },
    [codigo, adicionarItem, focarCampoBusca, m],
  )

  const handleAlterarQuantidade = useCallback(
    (itemId: string, quantidade: number) => {
      if (Number.isNaN(quantidade)) return
      alterarQuantidade(itemId, quantidade)
    },
    [alterarQuantidade],
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
    setCodigo("")
    setMensagem(null)
    limparEstadoDescontoGerente()
  }, [limparCarrinho, limparEstadoDescontoGerente])

  const parseValorMonetario = useCallback((raw: string | null): number | null => {
    if (raw == null) return null
    const normalizado = raw.trim().replace(",", ".")
    if (!normalizado) return null
    const parsed = Number(normalizado)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return roundMoney2(parsed)
  }, [])

  const handleAbrirCaixa = useCallback(async () => {
    if (processandoCaixa) return
    const raw = window.prompt(`${m.caixa.valor_inicial}:`, "0")
    const valorInicial = parseValorMonetario(raw)
    if (valorInicial === null) {
      setMensagem("Valor inicial inválido.")
      return
    }

    setProcessandoCaixa(true)
    setMensagem(null)
    try {
      const res = await abrirCaixaOperador(valorInicial)
      if (!res.ok) {
        setMensagem(res.error)
        return
      }
      setMensagem(`Caixa aberto (${res.caixaId.slice(0, 8)}…).`)
      await recarregarStatusCaixa()
    } finally {
      setProcessandoCaixa(false)
    }
  }, [m.caixa.valor_inicial, parseValorMonetario, processandoCaixa, recarregarStatusCaixa])

  const caixaAbertoParaFechar = caixaStatus?.aberto === true
  const blindClosureEnabled = caixaAbertoParaFechar ? caixaStatus.blindClosureEnabled : false
  const valorSistemaDinheiroParaFechar = caixaAbertoParaFechar ? caixaStatus.valorSistemaDinheiro : 0

  const erroExigeMotivoFechamento = useCallback((error: string) => {
    const e = error.toLowerCase()
    return e.includes("exige motivo") || (e.includes("diferença") && e.includes("motivo"))
  }, [])

  const handleFecharCaixa = useCallback(async () => {
    if (processandoCaixa) return
    if (itens.length > 0) {
      setMensagem("Finalize ou limpe o cupom antes de fechar o caixa.")
      return
    }
    const raw = window.prompt(`${m.caixa.valor_final}:`)
    const valorContado = parseValorMonetario(raw)
    if (valorContado === null) {
      setMensagem("Valor contado inválido.")
      return
    }
    const diferencaEstimada = caixaAbertoParaFechar
      ? roundMoney2(valorContado - valorSistemaDinheiroParaFechar)
      : null
    let motivo: string | undefined
    if (!blindClosureEnabled && diferencaEstimada !== null && Math.abs(diferencaEstimada) > 5) {
      const motivoRaw = window.prompt(
        `Diferença estimada de R$ ${diferencaEstimada.toFixed(2)}. Informe o motivo (mín. 5 caracteres):`,
      )
      if (!motivoRaw || motivoRaw.trim().length < 5) {
        setMensagem("Motivo obrigatório para diferença acima de R$ 5,00.")
        return
      }
      motivo = motivoRaw.trim()
    }

    setProcessandoCaixa(true)
    setMensagem(null)
    try {
      let res = await fecharCaixaOperador({ valorContado, motivo })
      if (!res.ok && blindClosureEnabled && erroExigeMotivoFechamento(res.error)) {
        const motivoRaw = window.prompt("Informe o motivo do ajuste (mín. 5 caracteres):")
        if (!motivoRaw || motivoRaw.trim().length < 5) {
          setMensagem("Motivo obrigatório para fechamento com divergência.")
          return
        }
        res = await fecharCaixaOperador({ valorContado, motivo: motivoRaw.trim() })
      }
      if (!res.ok) {
        setMensagem(res.error)
        return
      }
      const diferencaPrefixo = res.diferenca > 0 ? "+" : ""
      setMensagem(
        `Caixa fechado. Sistema: R$ ${res.valorSistemaDinheiro.toFixed(2)} · Contado: R$ ${res.valorContado.toFixed(2)} · Diferença: ${diferencaPrefixo}R$ ${res.diferenca.toFixed(2)}`,
      )
      await recarregarStatusCaixa()
    } finally {
      setProcessandoCaixa(false)
    }
  }, [
    caixaAbertoParaFechar,
    blindClosureEnabled,
    erroExigeMotivoFechamento,
    valorSistemaDinheiroParaFechar,
    itens.length,
    m.caixa.valor_final,
    parseValorMonetario,
    processandoCaixa,
    recarregarStatusCaixa,
  ])

  useEffect(() => {
    if (!gerenteValidadoAte) return

    const expiraEmMs = Date.parse(gerenteValidadoAte)
    if (!Number.isFinite(expiraEmMs)) {
      limparEstadoDescontoGerente()
      return
    }

    const checkExpiracao = () => {
      if (Date.now() >= expiraEmMs) {
        limparEstadoDescontoGerente()
        setMensagem(m.caixa.msg_token_expirado)
      }
    }

    checkExpiracao()
    const timer = window.setInterval(checkExpiracao, 1000)
    return () => window.clearInterval(timer)
  }, [gerenteValidadoAte, limparEstadoDescontoGerente, m.caixa.msg_token_expirado])

  const handleFinalizar = useCallback(async () => {
    if (itens.length === 0 || finalizando) return
    if (gerenteValidadoAte && Date.now() >= Date.parse(gerenteValidadoAte)) {
      limparEstadoDescontoGerente()
      setMensagem(m.caixa.msg_token_expirado)
      return
    }
    setFinalizando(true)
    setMensagem(null)
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
        setMensagem(
          caixaFmt(m.caixa.msg_venda_ok, { id: res.vendaId.slice(0, 8) }),
        )
        await recarregarStatusCaixa()
      } else {
        setMensagem(res.error)
      }
    } catch {
      setMensagem(m.caixa.msg_falha_finalizar)
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
    totalBruto,
    totalDesconto,
    totalLiquido,
    m,
    recarregarStatusCaixa,
  ])

  const handleFinalizarRef = useRef(handleFinalizar)
  const handleFecharCaixaRef = useRef(handleFecharCaixa)
  const focarCampoBuscaRef = useRef(focarCampoBusca)
  handleFinalizarRef.current = handleFinalizar
  handleFecharCaixaRef.current = handleFecharCaixa
  focarCampoBuscaRef.current = focarCampoBusca

  useEffect(() => {
    const alvoEhCampoTexto = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
      if (t.isContentEditable) return true
      if (t.closest("[data-caixa-atalho-bloqueado='true']")) return true
      return false
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (alvoEhCampoTexto(e.target)) return

      if (e.code === "F4") {
        e.preventDefault()
        void handleFinalizarRef.current()
        return
      }
      if (e.code === "F6") {
        e.preventDefault()
        void handleFecharCaixaRef.current()
        return
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyB") {
        e.preventDefault()
        focarCampoBuscaRef.current()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const handleSalvarMovimentacao = useCallback(
    async (payload: {
      valor: number
      motivoCodigo: string
      motivo: string
      gerenteSenha?: string
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!caixaStatus?.aberto) {
        return { ok: false, error: m.caixa.msg_caixa_fechado_movimentacao }
      }
      if (!movimentacaoModalTipo) {
        return { ok: false, error: m.caixa.msg_tipo_movimentacao_invalido }
      }

      setMovimentandoCaixa(true)
      try {
        const registro = await registrarMovimentacao({
          caixaId: caixaStatus.caixaId,
          tipo: movimentacaoModalTipo,
          formaPagamento: "dinheiro",
          valor: payload.valor,
          motivo: payload.motivo,
          motivoCodigo: payload.motivoCodigo,
          idempotencyKey: crypto.randomUUID(),
          terminalId: getDeviceFingerprint(),
        })

        if (!registro.ok) return { ok: false, error: registro.error }

        if (registro.status === "pendente") {
          if (!payload.gerenteSenha?.trim()) {
            setMensagem(m.caixa.msg_movimentacao_pendente_gerente)
            await recarregarStatusCaixa()
            return { ok: true }
          }
          const aprovacao = await autorizarMovimentacaoGerente(
            registro.movimentacaoId,
            payload.gerenteSenha,
          )
          if (!aprovacao.ok) {
            return {
              ok: false,
              error: caixaFmt(m.caixa.msg_movimentacao_aprovacao_falhou, {
                erro: aprovacao.error,
              }),
            }
          }
        }

        const label = movimentacaoModalTipo === "sangria" ? m.caixa.sangria : m.caixa.suprimento
        setMensagem(
          caixaFmt(m.caixa.msg_movimentacao_registrada_ok, {
            tipo: label,
            valor: payload.valor.toFixed(2),
          }),
        )
        await recarregarStatusCaixa()
        await recarregarMovimentacoes(caixaStatus.caixaId)
        return { ok: true }
      } finally {
        setMovimentandoCaixa(false)
      }
    },
    [caixaStatus, movimentacaoModalTipo, recarregarStatusCaixa, recarregarMovimentacoes, m],
  )

  const handleConfirmarAcaoMovimentacao = useCallback(
    async (motivo: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!acaoMovimentacao) return { ok: false, error: m.caixa.msg_acao_movimentacao_invalida }
      setProcessandoAcaoMovimentacao(true)
      try {
        if (acaoMovimentacao.tipo === "cancelar") {
          const res = await cancelarMovimentacaoCaixa(acaoMovimentacao.item.id, motivo)
          if (!res.ok) return { ok: false, error: res.error }
          setMensagem(m.caixa.timeline_msg_cancelada)
        } else {
          const res = await estornarMovimentacaoCaixa(acaoMovimentacao.item.id, motivo)
          if (!res.ok) return { ok: false, error: res.error }
          setMensagem(m.caixa.timeline_msg_estornada)
        }
        await recarregarStatusCaixa()
        if (caixaStatus?.aberto) {
          await recarregarMovimentacoes(caixaStatus.caixaId)
        }
        return { ok: true }
      } finally {
        setProcessandoAcaoMovimentacao(false)
      }
    },
    [acaoMovimentacao, caixaStatus, recarregarMovimentacoes, recarregarStatusCaixa, m],
  )

  const valorDescontoGerente =
    descontoGerentePercentual > 0
      ? roundMoney2((totalLiquido * descontoGerentePercentual) / 100)
      : 0
  const totalLiquidoComGerente = roundMoney2(totalLiquido - valorDescontoGerente)

  useEffect(() => {
    setPagamentos((prev) => {
      if (prev.length <= 1) {
        return [{ formaPagamento: prev[0]?.formaPagamento ?? "DINHEIRO", valor: totalLiquidoComGerente }]
      }
      const somaSemUltimo = prev.slice(0, -1).reduce((acc, p) => acc + p.valor, 0)
      const ultimo = Math.max(0, roundMoney2(totalLiquidoComGerente - somaSemUltimo))
      return [...prev.slice(0, -1), { ...prev[prev.length - 1], valor: ultimo }]
    })
  }, [totalLiquidoComGerente])

  const handlePagamentoFormaChange = useCallback(
    (index: number, forma: FinalizarVendaInput["formaPagamento"]) => {
      setPagamentos((prev) => prev.map((p, i) => (i === index ? { ...p, formaPagamento: forma } : p)))
    },
    [],
  )

  const handlePagamentoValorChange = useCallback(
    (index: number, valor: number) => {
      const v = Number.isFinite(valor) && valor > 0 ? roundMoney2(valor) : 0
      setPagamentos((prev) => prev.map((p, i) => (i === index ? { ...p, valor: v } : p)))
    },
    [],
  )

  const handleAdicionarPagamento = useCallback(() => {
    setPagamentos((prev) => {
      if (prev.length >= 4) return prev
      const restante = Math.max(0, roundMoney2(totalLiquidoComGerente - prev.reduce((acc, p) => acc + p.valor, 0)))
      return [...prev, { formaPagamento: "PIX", valor: restante }]
    })
  }, [totalLiquidoComGerente])

  const handleRemoverPagamento = useCallback((index: number) => {
    setPagamentos((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== index)
      const soma = next.reduce((acc, p) => acc + p.valor, 0)
      if (next.length > 0) {
        const ajuste = Math.max(0, roundMoney2(totalLiquidoComGerente - soma))
        next[next.length - 1] = { ...next[next.length - 1], valor: next[next.length - 1].valor + ajuste }
      }
      return next
    })
  }, [totalLiquidoComGerente])

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
      setMensagem(
        caixaFmt(m.caixa.msg_gerente_ok, {
          pct: payload.percentual.toFixed(2),
          hora: new Date(payload.expiraEm).toLocaleTimeString(loc),
        }),
      )
    },
    [m, loc],
  )

  return (
    <>
      <div className="min-h-[100dvh] bg-slate-900 text-slate-50 flex flex-col">
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
          <div className="shrink-0 px-4 sm:px-6 pt-4 pb-2 space-y-2">
            <CaixaSearchBar
              ref={buscaInputRef}
              m={m}
              codigo={codigo}
              onCodigoChange={setCodigo}
              onSubmit={handleAdicionar}
              onNovoCupom={handleNovoCupom}
              buscando={buscando}
              carregandoRegras={carregandoRegras}
            />
            {mensagem && (
              <div className="text-xs text-amber-300" role="status" aria-live="polite">
                {mensagem}
              </div>
            )}
          </div>
          <section className="flex-1 min-h-0 flex flex-col mx-4 sm:mx-6 rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden mb-2">
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
              onCancelar={(item) => setAcaoMovimentacao({ tipo: "cancelar", item })}
              onEstornar={(item) => setAcaoMovimentacao({ tipo: "estornar", item })}
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
            onAbrirSuprimento={() => setMovimentacaoModalTipo("suprimento")}
            onAbrirSangria={() => setMovimentacaoModalTipo("sangria")}
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
    </>
  )
}
