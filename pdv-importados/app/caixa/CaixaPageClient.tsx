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
  obterDetalheHistoricoVendaCaixa,
  converterVendaEmEsperaCaixa,
  devolverVendaEmEsperaCaixa,
  obterResumoVendasTurno,
  obterNomeLojaAtual,
  calcularPrecoProdutoCaixa,
} from "@/app/caixa/actions"
import type { ProdutoCaixaDTO } from "@/app/caixa/caixaActionTypes"
import { avisoEstoqueCaixa, montarItemCarrinhoCaixa } from "@/app/caixa/scan-pipeline/montarItemCarrinhoCaixa"
import { CaixaCandidatosProduto } from "@/app/caixa/CaixaCandidatosProduto"
import { useCaixaBuscaSugestoes } from "@/app/caixa/hooks/useCaixaBuscaSugestoes"
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client"
import { historicoDetalheParaRecibo } from "@/app/caixa/caixaHistoricoRecibo"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import { roundMoney2, type FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import {
  pagamentoParcialExigeCliente,
  EXCESSO_PAGAMENTO_EPS,
  avaliarExcessoParcelas,
} from "@/app/caixa/caixaPagamentoSaldo"
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
import { useCaixaVendasEmEspera } from "@/app/caixa/hooks/useCaixaVendasEmEspera"
import { useReprecificarQuantidadeCaixa } from "@/app/caixa/hooks/useReprecificarQuantidadeCaixa"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"
import { CaixaHeader } from "@/app/caixa/CaixaHeader"
import { CaixaSearchBar } from "@/app/caixa/CaixaSearchBar"
import { CaixaOperadorContextBar } from "@/app/caixa/CaixaOperadorContextBar"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import { CaixaPdvCartSaleBar } from "@/app/caixa/CaixaPdvCartSaleBar"
import { CaixaPdvOperacoesMenu } from "@/app/caixa/CaixaPdvOperacoesMenu"
import { CaixaRailTurnoSummary } from "@/app/caixa/CaixaRailTurnoSummary"
import { CaixaEmAbertoList } from "@/app/caixa/CaixaEmAbertoList"
import { CaixaConsultaRapidaModal } from "@/app/caixa/CaixaConsultaRapidaModal"
import { CaixaHistoricoSheet } from "@/app/caixa/CaixaHistoricoSheet"
import { CaixaAbrirTurnoModal } from "@/app/caixa/CaixaAbrirTurnoModal"
import {
  CaixaGerenteModal,
  type ValidarSenhaGerenteResult,
  type MotivoDescontoEnum,
} from "@/app/caixa/CaixaGerenteModal"
import { CaixaLimiteCreditoModal } from "@/app/caixa/CaixaLimiteCreditoModal"
import { CaixaMovimentacaoModal } from "@/app/caixa/CaixaMovimentacaoModal"
import { CaixaMovimentacaoReciboModal } from "@/app/caixa/CaixaMovimentacaoReciboModal"
import { CaixaFechamentoReciboModal, type ComprovanteFechamento } from "@/app/caixa/CaixaFechamentoReciboModal"
import type { TipoMovimentacaoUi } from "@/app/caixa/caixaMovimentacaoTypes"
import { CaixaMovimentacaoAcaoModal } from "@/app/caixa/CaixaMovimentacaoAcaoModal"
import type { AcaoMovimentacaoTipo } from "@/app/caixa/caixaMovimentacaoTypes"
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
import { CaixaPdvMetodoPagamentoSelector } from "@/app/caixa/CaixaPdvMetodoPagamentoSelector"
import {
  metodoPagamentoToForma,
  type MetodoPagamentoUi,
} from "@/app/caixa/caixaMetodoPagamento"
import { CaixaPdvOperadorTabs } from "@/app/caixa/CaixaPdvOperadorTabs"
import { CaixaSelecionarClienteModal } from "@/app/caixa/CaixaSelecionarClienteModal"  // ✅ NOVO (Fase 5b)

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
  const {
    mensagem,
    msgVendaOk,
    toasts,
    setCaixaMensagem,
    setCaixaMensagemVendaOk,
    dismissCaixaToast,
  } = useCaixaMensagens()

  const [codigo, setCodigo] = useState("")
  /** Onda 2 · Bloco 1 — candidatos de uma busca ambígua por nome/categoria (null = nenhuma pendente). */
  const [candidatos, setCandidatos] = useState<{ mensagem: string; itens: ProdutoCaixaDTO[] } | null>(null)
  const [candidatoAtivoIndex, setCandidatoAtivoIndex] = useState(0)
  const [checkoutHint, setCheckoutHint] = useState<string | null>(null)
  const [carregandoRegras, setCarregandoRegras] = useState(true)
  const [limiteSangriaSemGerente, setLimiteSangriaSemGerente] = useState(200)
  const [finalizando, setFinalizando] = useState(false)
  const [turnoRefreshToken, setTurnoRefreshToken] = useState(0)
  const [processandoCaixa, setProcessandoCaixa] = useState(false)
  const [validandoGerente, setValidandoGerente] = useState(false)
  const [gerenteModalAberto, setGerenteModalAberto] = useState(false)
  const [limiteCreditoModalAberto, setLimiteCreditoModalAberto] = useState(false)
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
  const [motivoDesconto, setMotivoDesconto] =
    useState<MotivoDescontoEnum>('NAO_ESPECIFICADO')
  const [motivoDescontoDescricao, setMotivoDescontoDescricao] =
    useState<string | null>(null)
  const [configCaixaWeb, setConfigCaixaWeb] = useState<Record<string, string>>({})
  const [somFeedbackAtivo, setSomFeedbackAtivo] = useState(false)
  const [confirmacaoPendente, setConfirmacaoPendente] = useState<
    | null
    | { tipo: "sangria" }
    | { tipo: "cancelar"; item: MovimentacaoCaixaDTO }
    | { tipo: "estornar"; item: MovimentacaoCaixaDTO }
  >(null)
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamentoUi>("dinheiro")
  const [consultaRapidaAberta, setConsultaRapidaAberta] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [abrirTurnoAberto, setAbrirTurnoAberto] = useState(false)

  const {
    caixaStatus,
    carregandoStatus,
    movimentacoes,
    movimentandoCaixa,
    processandoAcaoMovimentacao,
    comprovanteMovimentacao,
    limparComprovanteMovimentacao,
    recarregarStatusCaixa,
    handleSalvarMovimentacao,
    handleConfirmarAcaoMovimentacao,
  } = useCaixaStatusMovimentacoes({ m, setCaixaMensagem, movimentacaoModalTipo, acaoMovimentacao, currentUserId: userId })
  const [comprovanteFechamento, setComprovanteFechamento] = useState<ComprovanteFechamento | null>(null)

  // Selectors atômicos: a página só re-renderiza quando itens/totais mudam — não a
  // cada `set` do store (ex.: setCartOwnerForSession/setRegras, disparados em todo bip).
  const {
    itens: itensStore,
    totalBruto: totalBrutoStore,
    totalDesconto: totalDescontoStore,
    totalLiquido: totalLiquidoStore,
  } = useCarrinhoStore(
    useShallow((s) => ({
      itens: s.itens,
      totalBruto: s.totalBruto,
      totalDesconto: s.totalDesconto,
      totalLiquido: s.totalLiquido,
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
  // Ações têm referência estável no zustand — selecionadas individualmente, nunca causam re-render.
  const setRegras = useCarrinhoStore((s) => s.setRegras)
  const setCartOwnerForSession = useCarrinhoStore((s) => s.setCartOwnerForSession)
  const adicionarItem = useCarrinhoStore((s) => s.adicionarItem)
  const alterarQuantidade = useCarrinhoStore((s) => s.alterarQuantidade)
  const { reprecificar } = useReprecificarQuantidadeCaixa()
  const removerItem = useCarrinhoStore((s) => s.removerItem)
  const restaurarUltimoRemovido = useCarrinhoStore((s) => s.restaurarUltimoRemovido)
  const limparCarrinho = useCarrinhoStore((s) => s.limparCarrinho)
  const substituirCarrinho = useCarrinhoStore((s) => s.substituirCarrinho)
  const garantirVendaIdempotencyKey = useCarrinhoStore((s) => s.garantirVendaIdempotencyKey)
  const marcarFinalizacaoPendente = useCarrinhoStore((s) => s.marcarFinalizacaoPendente)
  const resolverFinalizacaoPendente = useCarrinhoStore((s) => s.resolverFinalizacaoPendente)
  const concluirVendaIdempotencyKey = useCarrinhoStore((s) => s.concluirVendaIdempotencyKey)
  const vendaFinalizacaoPendenteStore = useCarrinhoStore((s) => s.vendaFinalizacaoPendente)
  const vendaEmEsperaOrigemId = useCarrinhoStore((s) => s.vendaEmEsperaOrigemId)
  const setVendaEmEsperaOrigemId = useCarrinhoStore((s) => s.setVendaEmEsperaOrigemId)
  const vendaFinalizacaoPendente = cartMounted ? vendaFinalizacaoPendenteStore : false

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
    saldoPendente,  // ✅ NOVO (Fase 5b)
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
  /**
   * Recuperação de venda pendente: aberto quando a finalização terminou sem
   * desfecho conhecido (timeout ou queda de rede) e ao remontar a página com
   * `vendaFinalizacaoPendente` persistido (F5 / queda de energia).
   */
  const [vendaPendenteModalAberto, setVendaPendenteModalAberto] = useState(false)
  const [verificandoVendaPendente, setVerificandoVendaPendente] = useState(false)
  const cupomSessionIdRef = useRef<string>(newCupomSessionId())
  // Exibição do painel DEV precisa ficar "invisível" no primeiro paint do
  // cliente (igual ao server, que não roda efeitos): `cupomSessionIdRef` é
  // gerado via `crypto.randomUUID()` de forma independente em cada passe de
  // render (server e cliente), então mostrar seu valor antes da hidratação
  // terminar causa "Hydration failed" (texto SSR ≠ texto do cliente). Sem
  // tocar a lógica operacional do ref (guard de scan stale) — só atrasa a
  // exibição no painel de debug até depois do mount.
  const [pipelineDebugMounted, setPipelineDebugMounted] = useState(false)
  useEffect(() => {
    setPipelineDebugMounted(true)
  }, [])
  const lastScanItemRef = useRef<{ codigo: string; itemId: string; produtoId: string; ts: number } | null>(null)
  const lastReciboRef = useRef<ReciboVenda | null>(null)
  const [reimprimirModalAberto, setReimprimirModalAberto] = useState(false)
  const [clienteId, setClienteId] = useState<string | null>(null)  // ✅ NOVO (Fase 5b)
  const [clienteNome, setClienteNome] = useState<string | null>(null)  // ✅ NOVO (Fase 5b) - para exibição
  const [selecionarClienteModalAberto, setSelecionarClienteModalAberto] = useState(false)  // ✅ NOVO (Fase 5b)
  /** F1 alterna a referência de atalhos (renderizada no topbar). */
  const [atalhosReferenciaAberta, setAtalhosReferenciaAberta] = useState(false)

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

  const focarAbaPagamento = useCallback(() => {
    // Focar o painel de pagamento por ID (renderizado em CaixaPdvOperadorTabs)
    const pgtoPanel = document.getElementById('caixa-pdv-panel-pgto')
    pgtoPanel?.focus()
  }, [])

  const abrirSelecionarCliente = useCallback(() => {
    setSelecionarClienteModalAberto(true)
  }, [])

  const handleRemoverCliente = useCallback(() => {
    setClienteId(null)
    setClienteNome(null)
    setCaixaMensagem(m.caixa.msg_cliente_desvinculado, { kind: "info" })
    focarCampoBusca()
  }, [focarCampoBusca, m.caixa.msg_cliente_desvinculado, setCaixaMensagem])

  /**
   * Ímã de foco: só recupera o campo de leitura quando o foco está solto
   * (body/contêiner). Se o operador está num input, select ou botão — digitando o
   * valor de uma parcela, por exemplo — roubar o foco jogaria os próximos dígitos
   * no campo de código de barras. Não prejudica a leitura por scanner:
   * `useScannerDetector` escuta a rajada em `window`, sem depender do foco.
   */
  const focarBuscaSeOcioso = useCallback(() => {
    if (typeof document === "undefined") return
    const ativo = document.activeElement
    if (ativo instanceof HTMLElement && ativo !== buscaInputRef.current) {
      const tag = ativo.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        tag === "A" ||
        ativo.isContentEditable
      ) {
        return
      }
    }
    focarCampoBusca()
  }, [focarCampoBusca])

  // Idle focus magnet: after 3s of no keyboard/pointer activity, refocus the search field
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const reset = () => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(focarBuscaSeOcioso, 3000)
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
  }, [focarBuscaSeOcioso])

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

  /**
   * Onda 2 · Bloco 1 — ambiguidade por nome/categoria expõe candidatos em vez
   * de só bloquear com toast. `payload: null` limpa a lista (nova tentativa).
   */
  const setCandidatosAmbiguos = useCallback(
    (payload: { mensagem: string; itens: ProdutoCaixaDTO[] } | null) => {
      setCandidatos(payload)
      setCandidatoAtivoIndex(0)
    },
    [],
  )

  const fecharCandidatos = useCallback(() => {
    setCandidatos(null)
    setCandidatoAtivoIndex(0)
  }, [])

  const totalCandidatos = candidatos?.itens.length ?? 0
  const navegarCandidato = useCallback(
    (direcao: 1 | -1) => {
      if (totalCandidatos === 0) return
      setCandidatoAtivoIndex((prev) => (prev + direcao + totalCandidatos) % totalCandidatos)
    },
    [totalCandidatos],
  )

  /**
   * Mesma montagem de item usada no scan/Enter (`montarItemCarrinhoCaixa`) —
   * sem duplicar regra. Também replica o mesmo cuidado de dono de sessão do
   * carrinho que o scan já faz (`setCartOwnerForSession`): sem isso, se a
   * primeira ação do operador na sessão fosse escolher um candidato (em vez
   * de bipar), um carrinho de outro operador ainda em localStorage não seria
   * limpo — ver `unifiedCartStore.setCartOwnerForSession`.
   */
  const selecionarCandidato = useCallback(
    async (produto: ProdutoCaixaDTO) => {
      fecharCandidatos()
      const precoRes = await calcularPrecoProdutoCaixa({ produtoId: produto.id, quantidade: 1 })
      const precoCalculado = precoRes.ok ? precoRes.preco : produto.preco_varejo
      const tipoPrecoCalculado = precoRes.ok ? precoRes.tipo : 'VAREJO'

      const supabase = createSupabaseBrowserClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? null
      if (uid) setCartOwnerForSession(uid)

      const item = montarItemCarrinhoCaixa(produto, precoCalculado, tipoPrecoCalculado)
      adicionarItem(item)
      setCodigo('')
      const avisoEstoqueMsg = avisoEstoqueCaixa(produto, m)
      setCaixaMensagem(avisoEstoqueMsg ?? m.caixa.msg_item_adicionado_toast, {
        kind: avisoEstoqueMsg ? 'warning' : 'success',
      })
      tocarFeedback('ok')
      focarCampoBusca()
    },
    [adicionarItem, fecharCandidatos, focarCampoBusca, m, setCaixaMensagem, setCartOwnerForSession, tocarFeedback],
  )

  const selecionarCandidatoAtivo = useCallback(() => {
    const produto = candidatos?.itens[candidatoAtivoIndex]
    if (produto) void selecionarCandidato(produto)
  }, [candidatos, candidatoAtivoIndex, selecionarCandidato])

  const { enqueueLeitura, buscandoPipeline, flushLeiturasPendentes, pipelineDebug } = useCaixaScanPipeline({
    m,
    setCaixaMensagem,
    setCaixaMensagemScannerInfo: setCaixaMensagem,
    setCodigo,
    tocarFeedback,
    focarCampoBusca,
    adicionarItem,
    setCartOwnerForSession,
    setCandidatosAmbiguos,
    getActiveCupomSessionId: () => cupomSessionIdRef.current,
    onItemAdded: useCallback(
      (info: { codigo: string; itemId: string; produtoId: string }) => {
        lastScanItemRef.current = { ...info, ts: Date.now() }
      },
      [],
    ),
    // Decisão de produto: o PDV não cadastra produto. Código inexistente só
    // informa e orienta (mensagem do próprio pipeline de leitura) — cadastrar
    // pertence ao módulo Produtos (gerente/admin). Por isso nenhum
    // `onProdutoNaoEncontrado` é passado aqui.
  })

  useCaixaBuscaSugestoes(codigo, {
    enabled: !buscandoPipeline,
    mensagemUnico: m.caixa.sugestoes_unico,
    onSugestoes: setCandidatosAmbiguos,
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
      />
    ),
    [m, metodoPagamento, setMetodoPagamento, pagamentoControlesDesabilitados],
  )

  const limparEstadoDescontoGerente = useCallback(() => {
    setGerenteValidadoAte(null)
    setGerenteToken(null)
    setMaxDescontoGerentePercentual(0)
    setDescontoGerentePercentual(0)
    setMotivoDesconto('NAO_ESPECIFICADO')
    setMotivoDescontoDescricao(null)
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
            const novaQuantidade = item.quantidade + 1
            alterarQuantidade(last.itemId, novaQuantidade)
            reprecificar({
              itemId: last.itemId,
              produtoId: item.produtoId,
              quantidade: novaQuantidade,
              tipoPrecoAtual: item.resultado?.tipoPreco ?? "VAREJO",
            })
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
      [alterarQuantidade, enqueueLeitura, m.caixa.msg_fila_leituras_cheia, reprecificar, setCaixaMensagem],
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
      // Atualização otimista da quantidade; o preço é reconferido logo em seguida
      // via RPC (debounced) para refletir mudança de faixa de atacado.
      alterarQuantidade(itemId, quantidade)
      const item = useCarrinhoStore.getState().itens.find((i) => i.id === itemId)
      if (item) {
        reprecificar({
          itemId,
          produtoId: item.produtoId,
          quantidade,
          tipoPrecoAtual: item.resultado?.tipoPreco ?? "VAREJO",
          debounce: true,
        })
      }
    },
    [
      alterarQuantidade,
      m.caixa.msg_item_removido_qtde_zero,
      removerItem,
      reprecificar,
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
    // Ponto de estrangulamento do retorno a «novo cupom»: enquanto a venda
    // anterior puder ter sido gravada, abrir um cupom novo permitiria re-digitar
    // e cobrar a mesma venda duas vezes. Só libera após consultar o desfecho.
    if (useCarrinhoStore.getState().vendaFinalizacaoPendente) {
      setVendaPendenteModalAberto(true)
      setCaixaMensagem(m.caixa.msg_venda_pendente_bloqueio, { kind: "warning" })
      return
    }
    flushLeiturasPendentes({ reason: "new_cupom" })
    cupomSessionIdRef.current = newCupomSessionId()
    // Captura antes de limparCarrinho: o store zera o origemId no empty cart.
    const origemAbandonada = useCarrinhoStore.getState().vendaEmEsperaOrigemId
    limparCarrinho()
    resetPagamentos()
    setMetodoPagamento("dinheiro")
    setCodigo("")
    setCaixaMensagem(null)
    setCheckoutHint(null)
    limparEstadoDescontoGerente()
    setClienteId(null)  // Reset cliente selecionado para evitar vazar entre cupons
    setClienteNome(null)
    // Cupom abandonado: devolve RETOMADA → EM_ESPERA para o pedido voltar à lista
    // (P2). Sem isso o claim da retomada deixaria o cupom invisível para sempre.
    if (origemAbandonada) {
      void devolverVendaEmEsperaCaixa(origemAbandonada).catch(() => {})
    }
    focarCampoBusca()
  }, [
    flushLeiturasPendentes,
    focarCampoBusca,
    limparCarrinho,
    limparEstadoDescontoGerente,
    m.caixa.msg_venda_pendente_bloqueio,
    resetPagamentos,
    setCaixaMensagem,
  ])

  /**
   * "Excluir venda" / F8 (gatilhos do operador): confirma antes de descartar
   * o cupom quando há itens — evita perder uma venda em andamento com um
   * clique/atalho sem querer. Reset interno pós-espera (handleNovoCupom
   * chamado depois de colocarVendaEmEsperaCaixa) não passa por aqui: os
   * itens já foram salvos, não há o que confirmar.
   */
  const handleExcluirVendaConfirmado = useCallback(() => {
    // Antes do confirm: com venda pendente não há o que descartar — o cupom pode
    // já ter virado venda. Vai direto para a recuperação.
    if (useCarrinhoStore.getState().vendaFinalizacaoPendente) {
      handleNovoCupom()
      return
    }
    if (itens.length > 0 && !globalThis.confirm(m.caixa.cart_bar_excluir_confirmar)) {
      return
    }
    handleNovoCupom()
  }, [itens.length, handleNovoCupom, m.caixa.cart_bar_excluir_confirmar])

  const {
    vendasEmEspera,
    carregandoEmEspera,
    handleNovaVendaOuEspera,
    handleRetomarEmEspera,
    handleDescartarEmEspera,
  } = useCaixaVendasEmEspera({
    m,
    itens,
    totalBruto,
    totalDesconto,
    totalLiquidoComGerente,
    descontoGerentePercentual,
    caixaStatus,
    clienteId,
    turnoRefreshToken,
    novoCupom: handleNovoCupom,
    limparEstadoDescontoGerente,
    substituirCarrinho,
    reprecificar,
    setCaixaMensagem,
    tocarFeedback,
    focarCampoBusca,
    setClienteId,
    setClienteNome,
    vendaEmEsperaOrigemId,
    setVendaEmEsperaOrigemId,
  })

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

  // BR-01: mesmo texto humanizado que caixaErroOperador() devolve para todos os
  // códigos FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_* (ver server/caixaErroOperador.ts).
  const erroExigeAutorizacaoLimiteCredito = useCallback((error: string) => {
    const e = error.toLowerCase()
    return e.includes("limite de crédito") && e.includes("autorização")
  }, [])

  const executarFecharCaixa = useCallback(
    async (valorContado: number, motivo?: string) => {
      setProcessandoCaixa(true)
      setCaixaMensagem(null)
      try {
        // Snapshot pré-fechamento — caixaStatus ainda reflete o turno ABERTO aqui.
        // obterResumoVendasTurno() também precisa rodar antes: filtra por caixa ABERTO.
        const aberto = isCaixaAberto(caixaStatus) ? caixaStatus : null
        const [resumoTurno, nomeLoja] = await Promise.all([
          aberto ? obterResumoVendasTurno() : null,
          obterNomeLojaAtual(),
        ])

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

        if (!res.alreadyClosed && aberto) {
          const movsAprovadas = movimentacoes.filter((mv) => mv.status === "aprovado")
          const totalSangrias = movsAprovadas
            .filter((mv) => mv.tipo === "sangria")
            .reduce((acc, mv) => acc + mv.valor, 0)
          const totalSuprimentos = movsAprovadas
            .filter((mv) => mv.tipo === "suprimento")
            .reduce((acc, mv) => acc + mv.valor, 0)
          setComprovanteFechamento({
            lojaNome: nomeLoja.ok ? nomeLoja.nome : "—",
            operadorNome: operadorLabel,
            dataAbertura: new Date(aberto.dataAbertura),
            dataFechamento: new Date(),
            valorInicial: aberto.valorInicial,
            quantidadeVendas: resumoTurno?.ok ? resumoTurno.quantidadeVendas : 0,
            totalVendasRecebido: resumoTurno?.ok ? resumoTurno.totalRecebido : 0,
            totalSangrias,
            totalSuprimentos,
            valorSistemaDinheiro: res.valorSistemaDinheiro,
            valorContado: res.valorContado,
            diferenca: res.diferenca,
          })
        }
      } finally {
        setProcessandoCaixa(false)
      }
    },
    [
      caixaStatus,
      erroExigeMotivoFechamento,
      recarregarStatusCaixa,
      setCaixaMensagem,
      tocarFeedback,
      m,
      movimentacoes,
      operadorLabel,
    ],
  )

  const handleAbrirCaixa = useCallback(() => {
    if (processandoCaixa) return
    setAbrirTurnoAberto(true)
  }, [processandoCaixa])

  const handleConfirmarAbrirTurno = useCallback(
    (v: number) => {
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
    },
    [m.caixa.msg_caixa_aberto, recarregarStatusCaixa, setCaixaMensagem, tocarFeedback],
  )

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
        // Abrir caixa usa CaixaAbrirTurnoModal; ramo legado mantido por segurança.
        handleConfirmarAbrirTurno(v)
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
      handleConfirmarAbrirTurno,
    ],
  )

  const onConfirmMotivoFechar = useCallback(
    (motivo: string) => {
      if (!motivoFecharModal) return
      void executarFecharCaixa(motivoFecharModal.valorContado, motivo)
    },
    [motivoFecharModal, executarFecharCaixa],
  )

  const handleFinalizar = useCallback(async (limiteCreditoGerenteToken?: string) => {
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
    // Fase 5b (BA-001): underpay permitido — saldo vira contas a receber.
    // Sem cliente, abre modal (SSoT alinhada a caixaPagamentoSaldo + RPC v4).
    if (pagamentoParcialExigeCliente(saldoPendente, clienteId)) {
      setSelecionarClienteModalAberto(true)
      setCaixaMensagem(m.caixa.msg_pagamento_parcial_requer_cliente, { kind: "warning" })
      return
    }
    // Normalizar parcelas: desconta troco da última parcela DINHEIRO
    const parcelasNormalizadas = pagamentos.map((p) => ({
      formaPagamento: p.formaPagamento,
      valor: p.valor,
    }))
    const excesso = roundMoney2(totalPagamentos - totalLiquidoComGerente)
    if (excesso > EXCESSO_PAGAMENTO_EPS) {
      // Troco só existe em dinheiro: nunca abater o excesso de uma parcela
      // cartão/PIX — isso subregistraria em silêncio o valor realmente
      // cobrado na maquininha. Se não há dinheiro suficiente para cobrir o
      // excesso inteiro, é erro de digitação do operador: bloqueia e pede
      // correção em vez de redistribuir.
      const { idxDinheiro, dinheiroDisponivel, trocoValido } = avaliarExcessoParcelas(
        parcelasNormalizadas,
        excesso,
      )
      if (!trocoValido) {
        setCaixaMensagem(m.caixa.msg_pagamento_excesso_sem_dinheiro, { kind: "error" })
        return
      }
      parcelasNormalizadas[idxDinheiro].valor = roundMoney2(dinheiroDisponivel - excesso)
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
      // Chave criada uma única vez por cupom e persistida: sobrevive a F5, queda
      // de energia e fechamento da aplicação. Reenvios reusam exatamente esta
      // chave, então o RPC reconhece a venda já gravada em vez de criar outra.
      const idempotencyKey = garantirVendaIdempotencyKey()
      // Defense-in-depth Fase 5b (já checado no início de handleFinalizar)
      if (pagamentoParcialExigeCliente(saldoPendente, clienteId)) {
        setSelecionarClienteModalAberto(true)
        setFinalizando(false)
        setCaixaMensagem(m.caixa.msg_pagamento_parcial_requer_cliente, { kind: "warning" })
        return
      }

      const payload: FinalizarVendaInput = {
        idempotencyKey,
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
        motivoDesconto:
          descontoGerentePercentualEfetivo > 0 ? motivoDesconto : undefined,
        motivoDescontoDescricao:
          descontoGerentePercentualEfetivo > 0 ? motivoDescontoDescricao : undefined,
        pagamentos: parcelasParaEnviar,
        // Itens derivados do snapshot imutável já validado — não do store mutável.
        itens: checkoutSnapshot.itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoOriginal: i.precoOriginal,
          precoUnitario: i.precoUnitario,
          tipoPreco: i.tipoPreco,
        })),
        clienteId: clienteId ?? undefined,  // ✅ NOVO (Fase 5b)
        limiteCreditoGerenteToken, // BR-01: presente só no reenvio pós-autorização
      }
      const timeoutResult: { ok: false; error: string } = {
        ok: false,
        error: m.caixa.msg_checkout_timeout,
      }
      // A partir daqui a venda pode existir no servidor. O flag é persistido
      // ANTES do disparo para cobrir queda de energia no meio da chamada.
      marcarFinalizacaoPendente()
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
        // Captura antes de limpar: empty cart zera vendaEmEsperaOrigemId no store.
        const origemConvertida = useCarrinhoStore.getState().vendaEmEsperaOrigemId
        concluirVendaIdempotencyKey()
        limparCarrinho()
        limparEstadoDescontoGerente()
        resetPagamentos()
        setClienteId(null)  // ✅ NOVO (Fase 5b) - reset após venda bem-sucedida
        setClienteNome(null)
        // Agora sim o pedido em espera saiu: virou venda. Escrituração acessória —
        // nunca pode derrubar o caminho de sucesso e cair no catch de "pendente"
        // com a venda já concluída e a chave já descartada (isso reabriria a
        // porta da venda duplicada). Falhando, o pedido fica RETOMADA (não
        // revendável) até correção manual — melhor que estoque em dobro.
        if (origemConvertida) {
          void converterVendaEmEsperaCaixa(origemConvertida).catch(() => {})
        }
        setTurnoRefreshToken((t) => t + 1)
        // Fecha o modal de "venda pendente" se por acaso ainda estiver aberto
        // (ex.: reaberto pelo efeito de remontagem com `vendaFinalizacaoPendente`
        // persistido de uma tentativa anterior). Sem isso, o backdrop dele fica
        // por cima do recibo de sucesso e bloqueia clique em qualquer botão —
        // comprovado em E2E (park → refresh → resume → finalizar). Mesma
        // garantia que `handleVerificarVendaPendente` já faz antes do seu
        // próprio toast de sucesso.
        setVendaPendenteModalAberto(false)
        setCaixaMensagemVendaOk(
          caixaFmt(m.caixa.msg_venda_ok, { id: res.vendaId.slice(0, 8) }),
          { kind: "success" },
        )
        tocarFeedback("ok")
        await recarregarStatusCaixa()
      } else if (res === timeoutResult) {
        // Desfecho DESCONHECIDO: o servidor pode ter concluído a venda depois do
        // timeout. Preserva o estado pendente e a chave; a saída é a verificação.
        setCaixaMensagem(m.caixa.msg_venda_pendente_titulo, { kind: "warning" })
        setCheckoutHint(m.caixa.msg_venda_pendente_descricao)
        setVendaPendenteModalAberto(true)
        tocarFeedback("erro")
      } else {
        // Erro devolvido pelo servidor: a resposta chegou, logo a transação não
        // foi confirmada. Libera o fluxo mantendo a chave para o próximo envio.
        resolverFinalizacaoPendente()
        // BR-01: sem token ainda (1ª tentativa) e o backend pede autorização de
        // limite de crédito — reabre o modal gerencial em vez de só reportar o
        // erro. Se JÁ havia token (reenvio) e falhou de novo, cai no caminho
        // normal abaixo (evita loop silencioso de retry).
        if (!limiteCreditoGerenteToken && erroExigeAutorizacaoLimiteCredito(res.error)) {
          setLimiteCreditoModalAberto(true)
          return
        }
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
      // Exceção (rede caiu, aba suspensa, action abortada): igual ao timeout, o
      // desfecho é desconhecido — nunca assumir que a venda falhou.
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[caixa/finalizar-venda]', {
        idempotencyKey: useCarrinhoStore.getState().vendaIdempotencyKey,
        error: errMsg,
      })
      // Só é recuperação se a finalização continua pendente. Uma exceção depois
      // da venda já confirmada (ex.: recarga de status falhou) não pode exibir
      // «venda pendente» para uma venda que deu certo.
      if (useCarrinhoStore.getState().vendaFinalizacaoPendente) {
        setCaixaMensagem(m.caixa.msg_venda_pendente_titulo, { kind: "warning" })
        setCheckoutHint(m.caixa.msg_venda_pendente_descricao)
        setVendaPendenteModalAberto(true)
      } else {
        setCaixaMensagem(m.caixa.msg_falha_finalizar, { kind: "error" })
        setCheckoutHint(
          inferirHintCheckout(errMsg, {
            padrao: m.caixa.msg_checkout_hint_padrao,
            cupom: m.caixa.msg_checkout_hint_cupom,
            sessao: m.caixa.msg_checkout_hint_sessao,
            rede: m.caixa.msg_checkout_hint_rede,
          }),
        )
      }
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
    motivoDesconto,
    motivoDescontoDescricao,
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
    clienteId,
    saldoPendente,
    garantirVendaIdempotencyKey,
    marcarFinalizacaoPendente,
    resolverFinalizacaoPendente,
    concluirVendaIdempotencyKey,
    erroExigeAutorizacaoLimiteCredito,
  ])

  /**
   * Recuperação da venda pendente: consulta o desfecho real pela chave de
   * idempotência (que é o `venda_id`). Só existem dois desfechos possíveis —
   * a venda está gravada (encerra o cupom) ou não existe (libera o reenvio com
   * a MESMA chave). Falha de rede na consulta não conclui nada.
   */
  const handleVerificarVendaPendente = useCallback(async () => {
    const chave = useCarrinhoStore.getState().vendaIdempotencyKey
    if (!chave) {
      resolverFinalizacaoPendente()
      setVendaPendenteModalAberto(false)
      return
    }
    setVerificandoVendaPendente(true)
    try {
      const res = await obterDetalheHistoricoVendaCaixa(chave)
      if (res.ok) {
        // Venda gravada: encerra o cupom exatamente como no caminho de sucesso.
        lastReciboRef.current = historicoDetalheParaRecibo(res.detalhe, m.caixa.moeda_prefixo)
        const origemConvertida = useCarrinhoStore.getState().vendaEmEsperaOrigemId
        concluirVendaIdempotencyKey()
        limparCarrinho()
        limparEstadoDescontoGerente()
        resetPagamentos()
        setClienteId(null)
        setClienteNome(null)
        // Acessório, como no caminho de sucesso: não pode derrubar a recuperação.
        if (origemConvertida) {
          void converterVendaEmEsperaCaixa(origemConvertida).catch(() => {})
        }
        setVendaPendenteModalAberto(false)
        setCheckoutHint(null)
        setTurnoRefreshToken((t) => t + 1)
        setCaixaMensagemVendaOk(
          caixaFmt(m.caixa.msg_venda_ok, { id: res.detalhe.id.slice(0, 8) }),
          { kind: "success" },
        )
        tocarFeedback("ok")
        await recarregarStatusCaixa()
        return
      }
      if (res.code === 'VENDA_NAO_ENCONTRADA') {
        // Confirmado: nada foi gravado. Libera o fluxo preservando a chave.
        resolverFinalizacaoPendente()
        setVendaPendenteModalAberto(false)
        setCaixaMensagem(m.caixa.msg_venda_pendente_nao_gravada, { kind: "warning" })
        setCheckoutHint(m.caixa.msg_checkout_hint_padrao)
        return
      }
      // Consulta falhou (rede/sessão): permanece pendente, nada foi decidido.
      setCaixaMensagem(res.error, { kind: "error" })
      setCheckoutHint(m.caixa.msg_venda_pendente_descricao)
    } finally {
      setVerificandoVendaPendente(false)
    }
  }, [
    concluirVendaIdempotencyKey,
    resolverFinalizacaoPendente,
    limparCarrinho,
    limparEstadoDescontoGerente,
    resetPagamentos,
    recarregarStatusCaixa,
    setCaixaMensagem,
    setCaixaMensagemVendaOk,
    tocarFeedback,
    m,
  ])

  /**
   * Reabre a recuperação quando a página remonta com finalização pendente
   * persistida (F5, queda de energia, fechamento inesperado da aplicação).
   */
  useEffect(() => {
    if (cartMounted && vendaFinalizacaoPendente) {
      setVendaPendenteModalAberto(true)
    }
  }, [cartMounted, vendaFinalizacaoPendente])

  useCaixaGerenteTokenExpiry({
    gerenteValidadoAte,
    onExpire: useCallback(() => {
      limparEstadoDescontoGerente()
      setCaixaMensagem(m.caixa.msg_token_expirado, { kind: "warning" })
    }, [limparEstadoDescontoGerente, m.caixa.msg_token_expirado, setCaixaMensagem]),
  })

  const pdvClassicAtalhos = useMemo(
    () => ({
      onExcluirVenda: handleExcluirVendaConfirmado,
      onFinalizarVenda: () => void handleFinalizar(),
      abas: {
        // Alt+Z leva o foco ao campo de leitura, não ao contêiner: o operador
        // aperta Alt+Z justamente para voltar a bipar/digitar.
        produto: focarCampoBusca,
        cliente: abrirSelecionarCliente,
        pgto: focarAbaPagamento,
      },
    }),
    [
      handleExcluirVendaConfirmado,
      handleFinalizar,
      focarCampoBusca,
      focarAbaPagamento,
      abrirSelecionarCliente,
    ],
  )

  useCaixaKeyboardShortcuts({
    caixaAberto: isCaixaAberto(caixaStatus),
    movimentandoCaixa,
    onAbrirSuprimento: handleAbrirSuprimento,
    onAbrirSangria: handleAbrirSangria,
    onFinalizar: () => void handleFinalizar(),
    onFecharCaixa: () => void handleFecharCaixa(),
    onFocarBusca: focarCampoBusca,
    onNovoCupom: handleExcluirVendaConfirmado,
    onReimprimir: useCallback(() => {
      if (lastReciboRef.current) setReimprimirModalAberto(true)
    }, []),
    onConsultaRapida: () => setConsultaRapidaAberta(true),
    onDesfazerRemocao: handleDesfazerRemocao,
    onAbrirReferencia: useCallback(() => setAtalhosReferenciaAberta((v) => !v), []),
    onSelecionarMetodo: useCallback(
      (indice: 1 | 2 | 3 | 4) => {
        if (pagamentoControlesDesabilitados) return
        const metodos: MetodoPagamentoUi[] = ["dinheiro", "pix", "credito", "debito"]
        setMetodoPagamento(metodos[indice - 1])
      },
      [pagamentoControlesDesabilitados],
    ),
    pdvClassicAtalhos,
  })

  const handleImprimirCupomHistorico = useCallback(
    async (vendaId: string) => {
      const res = await obterDetalheHistoricoVendaCaixa(vendaId)
      if (!res.ok) {
        setCaixaMensagem(res.error, { kind: "error" })
        return
      }
      if (res.detalhe.itens.length === 0) {
        setCaixaMensagem(m.caixa.historico_itens_indisponiveis, { kind: "error" })
        return
      }
      lastReciboRef.current = historicoDetalheParaRecibo(res.detalhe, m.caixa.moeda_prefixo)
      setHistoricoAberto(false)
      setReimprimirModalAberto(true)
    },
    [m, setCaixaMensagem],
  )

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
      motivo: MotivoDescontoEnum
      motivoDescricao: string | null
    }) => {
      setGerenteValidadoAte(payload.expiraEm)
      setGerenteToken(payload.token)
      setMaxDescontoGerentePercentual(payload.maxDescontoPercentual)
      setDescontoGerentePercentual(payload.percentual)
      setMotivoDesconto(payload.motivo)
      setMotivoDescontoDescricao(payload.motivoDescricao)
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
  // BR-01: gerente autoriza → reenvia a MESMA finalização com o token, revalidando
  // o carrinho atual (não reaproveita um payload antigo).
  const handleAutorizarLimiteCredito = useCallback(
    (token: string) => {
      setLimiteCreditoModalAberto(false)
      setCaixaMensagem(m.caixa.msg_limite_credito_autorizado, { kind: "success" })
      void handleFinalizar(token)
    },
    [handleFinalizar, m, setCaixaMensagem],
  )
  return (
    <>
      <div className="caixa-oriental-root h-[100dvh] overflow-hidden flex flex-col text-[14px] leading-5 bg-background text-foreground">
        <CaixaHeader
          m={m}
          idioma={idioma}
          operadorLabel={operadorLabel}
          caixaStatus={caixaStatus}
          carregandoStatus={carregandoStatus}
          processandoCaixa={processandoCaixa}
          onAbrirCaixa={handleAbrirCaixaClick}
          onFecharCaixa={handleFecharCaixaClick}
          onTentarStatusNovamente={() => void recarregarStatusCaixa()}
          printerStatus={thermal.status}
          printerDeviceName={thermal.deviceInfo?.name ?? thermal.savedInfo?.name}
          atalhosAbertos={atalhosReferenciaAberta}
          onAtalhosOpenChange={setAtalhosReferenciaAberta}
        />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 px-4 sm:px-6 pt-4 pb-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(11.5rem,15rem)] md:grid-rows-[minmax(0,1fr)]">
            <div className="min-h-0 flex flex-col md:min-h-0">
              <CaixaPdvOperadorTabs
                m={m}
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
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                    <CaixaOperadorContextBar
                      m={m}
                      idioma={idioma}
                      configCaixaWeb={configCaixaWeb}
                      clienteNome={clienteNome}
                      onRemoverCliente={handleRemoverCliente}
                    />
                    <div className="shrink-0">
                      <CaixaSearchBar
                        ref={buscaInputRef}
                        m={m}
                        codigo={codigo}
                        onCodigoChange={setCodigo}
                        onSubmit={handleAdicionar}
                        onNovoCupom={handleExcluirVendaConfirmado}
                        buscando={buscandoPipeline}
                        carregandoRegras={carregandoRegras}
                        somAtivo={somFeedbackAtivo}
                        onToggleSom={() => setSomFeedbackAtivo((prev) => !prev)}
                        hideNovoCupom
                        compact={codigo.trim().length > 0}
                        temCandidatos={totalCandidatos > 0}
                        onNavegarCandidato={navegarCandidato}
                        onSelecionarCandidatoAtivo={selecionarCandidatoAtivo}
                        onFecharCandidatos={fecharCandidatos}
                      />
                      {candidatos && candidatos.itens.length > 0 ? (
                        <CaixaCandidatosProduto
                          m={m}
                          idioma={idioma}
                          mensagem={candidatos.mensagem}
                          itens={candidatos.itens}
                          ativoIndex={candidatoAtivoIndex}
                          onHoverIndex={setCandidatoAtivoIndex}
                          onSelecionar={(produto) => void selecionarCandidato(produto)}
                        />
                      ) : null}
                    </div>
                    <div className="shrink-0">
                      <CaixaMessageBanner mensagem={mensagem} msgVendaOk={msgVendaOk} kind={checkoutHint ? 'error' : undefined} hint={checkoutHint} />
                    </div>
                  </div>
                }
              />
            </div>
            <section className="flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-xl md:min-h-0 border border-border bg-card">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <CaixaCartList
                  m={m}
                  idioma={idioma}
                  itens={itens}
                  moeda={m.caixa.moeda_prefixo}
                  listEmptyVariant="pdv_classic"
                  onAlterarQuantidade={handleAlterarQuantidade}
                  onRemover={handleRemover}
                />
              </div>
              <CaixaPdvCartSaleBar
                m={m}
                onExcluirVenda={handleExcluirVendaConfirmado}
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
                valorDescontoGerente={valorDescontoGerente}
                descontoGerentePercentual={descontoGerentePercentualEfetivo}
                moedaPrefixo={m.caixa.moeda_prefixo}
              />
            </section>
            <aside className="hidden min-h-0 flex flex-col gap-2 rounded-xl border p-3 text-sm md:flex border-border bg-card text-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)] rounded-[1.4rem]">
              <button
                type="button"
                className="w-full rounded-md border px-3 py-2 text-center text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 border-border bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => void handleNovaVendaOuEspera()}
                disabled={carregandoRegras || finalizando}
              >
                {m.caixa.nova_venda_espera}
              </button>
              <div className="border-t pt-2 text-xs font-semibold uppercase tracking-wide border-border text-muted-foreground">
                {m.caixa.rail_titulo_operacoes}
              </div>
              <CaixaPdvOperacoesMenu
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
                podeReimprimir={!!lastReciboRef.current}
                onAbrirSuprimento={handleAbrirSuprimento}
                onAbrirSangria={handleAbrirSangria}
                onValidarGerente={abrirGerenteModal}
                onHistorico={() => setHistoricoAberto(true)}
                onImprimirUltima={() => setReimprimirModalAberto(true)}
                onFecharCaixa={handleFecharCaixaClick}
                onAbrirCaixa={handleAbrirCaixaClick}
                onConsultaRapida={() => setConsultaRapidaAberta(true)}
                onSelecionarCliente={abrirSelecionarCliente}
              />
              <div className="border-t pt-2 text-xs font-semibold uppercase tracking-wide border-border text-muted-foreground">
                {m.caixa.rail_titulo_em_aberto}
              </div>
              <CaixaEmAbertoList
                m={m}
                vendas={vendasEmEspera}
                carregando={carregandoEmEspera}
                onRetomar={(id) => void handleRetomarEmEspera(id)}
                onDescartar={(id) => void handleDescartarEmEspera(id)}
              />
              <div className="mt-auto border-t pt-2">
                <CaixaRailTurnoSummary
                  m={m}
                  idioma={idioma}
                  caixaAberto={isCaixaAberto(caixaStatus)}
                  refreshToken={turnoRefreshToken}
                />
              </div>
            </aside>
          </div>
          <div className="border-t px-4 py-3 sm:px-6 md:hidden border-border bg-card text-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)]">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {m.caixa.rail_titulo_operacoes}
            </div>
            <div className="mt-2">
              <CaixaPdvOperacoesMenu
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
                podeReimprimir={!!lastReciboRef.current}
                onAbrirSuprimento={handleAbrirSuprimento}
                onAbrirSangria={handleAbrirSangria}
                onValidarGerente={abrirGerenteModal}
                onHistorico={() => setHistoricoAberto(true)}
                onImprimirUltima={() => setReimprimirModalAberto(true)}
                onFecharCaixa={handleFecharCaixaClick}
                onAbrirCaixa={handleAbrirCaixaClick}
                onConsultaRapida={() => setConsultaRapidaAberta(true)}
                onSelecionarCliente={abrirSelecionarCliente}
              />
            </div>
          </div>
          {/* Rodapé de resumo removido: repetia total, bruto, descontos e o botão
              Finalizar logo abaixo da barra do carrinho — duas faixas empilhadas
              dizendo a mesma coisa. O total único e sempre visível é o da barra. */}
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
          activeCupomSessionId={pipelineDebugMounted ? cupomSessionIdRef.current : undefined}
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
      <CaixaLimiteCreditoModal
        open={limiteCreditoModalAberto}
        onOpenChange={setLimiteCreditoModalAberto}
        m={m}
        validando={validandoGerente}
        onValidateSenha={handleValidateSenhaGerente}
        onAutorizado={handleAutorizarLimiteCredito}
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
      {comprovanteMovimentacao && (
        <CaixaMovimentacaoReciboModal
          comprovante={comprovanteMovimentacao}
          m={m}
          onClose={limparComprovanteMovimentacao}
        />
      )}
      {comprovanteFechamento && (
        <CaixaFechamentoReciboModal
          comprovante={comprovanteFechamento}
          m={m}
          onClose={() => setComprovanteFechamento(null)}
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
      {/* Recuperação de venda pendente (desfecho desconhecido após timeout,
          queda de rede ou reinício da aplicação). */}
      <CaixaConfirmModal
        open={vendaPendenteModalAberto}
        title={m.caixa.msg_venda_pendente_titulo}
        description={m.caixa.msg_venda_pendente_descricao}
        m={m}
        processing={verificandoVendaPendente}
        initialFocus="confirm"
        confirmLabel={m.caixa.msg_venda_pendente_verificar}
        confirmVariant="primary"
        onOpenChange={(open) => {
          if (!open) setVendaPendenteModalAberto(false)
        }}
        onConfirm={() => void handleVerificarVendaPendente()}
      />
      <CaixaConsultaRapidaModal
        open={consultaRapidaAberta}
        onOpenChange={setConsultaRapidaAberta}
        m={m}
        termoInicial={codigo}
      />
      <CaixaHistoricoSheet
        open={historicoAberto}
        onOpenChange={setHistoricoAberto}
        m={m}
        onImprimirCupom={handleImprimirCupomHistorico}
      />
      <CaixaAbrirTurnoModal
        open={abrirTurnoAberto}
        onOpenChange={setAbrirTurnoAberto}
        m={m}
        operadorLabel={operadorLabel}
        initialValor="0"
        parseValor={parseValorMonetario}
        onConfirm={handleConfirmarAbrirTurno}
      />
      {/* ✅ NOVO (Fase 5b): Modal para seleção de cliente */}
      <CaixaSelecionarClienteModal
        aberto={selecionarClienteModalAberto}
        m={m}
        onSelecionado={(id, nome) => {
          setClienteId(id)
          setClienteNome(nome)
          setSelecionarClienteModalAberto(false)
          setCaixaMensagem(caixaFmt(m.caixa.msg_cliente_vinculado, { nome }), { kind: "success" })
          focarCampoBusca()
        }}
        onCancelado={() => setSelecionarClienteModalAberto(false)}
      />
    </>
  )
}