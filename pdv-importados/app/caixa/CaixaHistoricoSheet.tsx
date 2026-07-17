"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import {
  listarHistoricoOperadorCaixa,
  obterDetalheHistoricoVendaCaixa,
  cancelarVenda,
  obterVendaDetalheParaDevolucaoCaixa,
  type HistoricoVendaDetalhe,
  type HistoricoVendaOperador,
  type VendaDetalhe,
} from "@/app/caixa/actions"
import { formatDecimalBRL } from "@/lib/format/money"
import { labelFormaPagamentoVenda, labelStatusVenda } from "@/lib/format/vendaLabels"
import { downloadCsvBrowser } from "@/lib/gerente/gerenteCadastroUi"
import { cn } from "@/lib/utils"
import { CaixaGerenteSenhaModal } from "@/app/caixa/CaixaGerenteSenhaModal"
import { CaixaCancelarVendaModal } from "@/app/caixa/CaixaCancelarVendaModal"
import { CaixaDevolverVendaModal } from "@/app/caixa/CaixaDevolverVendaModal"
import { useAutorizacaoGerentePontual } from "@/app/caixa/hooks/useAutorizacaoGerentePontual"
import { OperacaoPrivilegiada } from "@/lib/authorization"

const PERFIS_GERENTE = ["GERENTE", "DONO", "ADMIN"]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  perfil: string | null
  onImprimirCupom?: (vendaId: string) => void
}

function fmtHora(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function exportarListaCsv(vendas: HistoricoVendaOperador[]) {
  downloadCsvBrowser(
    "historico-operador.csv",
    [
      { key: "numero", header: "numero_venda" },
      { key: "hora", header: "hora" },
      { key: "cliente", header: "cliente" },
      { key: "total", header: "total" },
      { key: "status", header: "status" },
      { key: "forma", header: "forma_pagamento" },
      { key: "itens", header: "qtd_itens" },
    ],
    vendas.map((v) => ({
      numero: v.numeroVenda,
      hora: v.data ?? "",
      cliente: v.clienteNome ?? "",
      total: v.totalLiquido,
      status: v.status ?? "",
      forma: v.formaPagamento ?? "",
      itens: v.qtdItens,
    })),
  )
}

function exportarDetalheCsv(detalhe: HistoricoVendaDetalhe) {
  downloadCsvBrowser(
    `venda-${detalhe.numeroVenda.replace("#", "")}.csv`,
    [
      { key: "produto", header: "produto" },
      { key: "qtd", header: "quantidade" },
      { key: "unit", header: "preco_unitario" },
      { key: "total", header: "total_linha" },
    ],
    detalhe.itens.map((i) => ({
      produto: i.nome,
      qtd: i.quantidade,
      unit: i.precoUnitario,
      total: i.total,
    })),
  )
}

type ListaProps = {
  vendas: HistoricoVendaOperador[]
  selecionadoId: string | null
  m: Mensagens
  onSelect: (id: string) => void
}

function HistoricoLista({ vendas, selecionadoId, m, onSelect }: ListaProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 z-[1] bg-jl-surface-elev text-[10px] uppercase tracking-wide text-jl-fg-3">
          <tr className="border-b border-jl-border-1">
            <th className="px-2 py-1.5 font-semibold">{m.caixa.historico_col_numero}</th>
            <th className="px-2 py-1.5 font-semibold">{m.caixa.historico_col_hora}</th>
            <th className="px-2 py-1.5 font-semibold">{m.caixa.historico_col_cliente}</th>
            <th className="px-2 py-1.5 text-right font-semibold">{m.caixa.historico_col_total}</th>
            <th className="px-2 py-1.5 font-semibold">{m.caixa.historico_col_status}</th>
          </tr>
        </thead>
        <tbody>
          {vendas.map((v) => {
            const sel = selecionadoId === v.id
            const cancelada = String(v.status ?? "").toUpperCase() === "CANCELADA"
            return (
              <tr
                key={v.id}
                className={cn(
                  "cursor-pointer border-b border-jl-border-1/60",
                  sel ? "bg-primary/10" : "hover:bg-white/[0.04]",
                )}
                onClick={() => onSelect(v.id)}
              >
                <td className="px-2 py-2 font-medium tabular-nums">{v.numeroVenda}</td>
                <td className="px-2 py-2 tabular-nums text-jl-fg-2">{fmtHora(v.data)}</td>
                <td className="max-w-[6rem] truncate px-2 py-2 text-jl-fg-2">
                  {v.clienteNome ?? m.caixa.historico_sem_cliente}
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {m.caixa.moeda_prefixo} {formatDecimalBRL(v.totalLiquido)}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      cancelada
                        ? "bg-red-500/15 text-red-400"
                        : "bg-emerald-500/15 text-emerald-400",
                    )}
                  >
                    {labelStatusVenda(v.status, m)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type DetalheProps = {
  detalhe: HistoricoVendaDetalhe | null
  carregando: boolean
  m: Mensagens
}

function HistoricoDetalhe({ detalhe, carregando, m }: DetalheProps) {
  if (carregando) {
    return <p className="text-sm text-jl-fg-3">{m.comum.carregando}</p>
  }
  if (!detalhe) {
    return (
      <p className="text-sm italic text-jl-fg-3">{m.caixa.historico_selecione_venda}</p>
    )
  }

  const cancelada = String(detalhe.status ?? "").toUpperCase() === "CANCELADA"
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <header className="shrink-0 space-y-1 border-b border-jl-border-1 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">{detalhe.numeroVenda}</h3>
          <span className="text-sm tabular-nums text-jl-fg-3">{fmtDataHora(detalhe.data)}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-jl-fg-3">
          <span>
            {m.caixa.historico_col_cliente}:{" "}
            <strong className="text-jl-fg-2">
              {detalhe.clienteNome ?? m.caixa.historico_sem_cliente}
            </strong>
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 font-semibold",
              cancelada ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400",
            )}
          >
            {labelStatusVenda(detalhe.status, m)}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {detalhe.itens.length === 0 ? (
          <p className="text-sm italic text-jl-fg-3">{m.caixa.historico_itens_indisponiveis}</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-jl-surface-elev text-[10px] uppercase text-jl-fg-3">
              <tr className="border-b border-jl-border-1">
                <th className="px-2 py-1.5">{m.caixa.historico_item_produto}</th>
                <th className="px-2 py-1.5 text-right">{m.caixa.historico_item_qtd}</th>
                <th className="px-2 py-1.5 text-right">{m.caixa.historico_item_unit}</th>
                <th className="px-2 py-1.5 text-right">{m.caixa.historico_item_total}</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.itens.map((item, idx) => (
                <tr key={`${item.produtoId}-${idx}`} className="border-b border-jl-border-1/50">
                  <td className="px-2 py-1.5">{item.nome}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.quantidade}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatDecimalBRL(item.precoUnitario)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {formatDecimalBRL(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="shrink-0 space-y-1 border-t border-jl-border-1 pt-3 text-xs">
        <div className="flex justify-between text-jl-fg-3">
          <span>{m.caixa.recibo.subtotal}</span>
          <span className="tabular-nums">
            {m.caixa.moeda_prefixo} {formatDecimalBRL(detalhe.totalBruto)}
          </span>
        </div>
        {detalhe.totalDesconto > 0 ? (
          <div className="flex justify-between text-jl-fg-3">
            <span>{m.caixa.recibo.desconto_produtos}</span>
            <span className="tabular-nums">
              − {m.caixa.moeda_prefixo} {formatDecimalBRL(detalhe.totalDesconto)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between text-sm font-bold">
          <span>{m.caixa.recibo.total}</span>
          <span className="tabular-nums">
            {m.caixa.moeda_prefixo} {formatDecimalBRL(detalhe.totalLiquido)}
          </span>
        </div>
        <div className="pt-1 text-jl-fg-3">
          {m.caixa.recibo.pagamento}:{" "}
          {detalhe.pagamentos
            .map(
              (p) =>
                `${labelFormaPagamentoVenda(p.formaPagamento, m)} ${formatDecimalBRL(p.valor)}`,
            )
            .join(" · ")}
        </div>
      </footer>
    </div>
  )
}

type FerramentasProps = {
  m: Mensagens
  temSelecao: boolean
  temItens: boolean
  podeCancelarOuDevolver: boolean
  carregandoDevolucao: boolean
  onImprimirCupom: () => void
  onExportarLista: () => void
  onExportarDetalhe: () => void
  onCancelarVenda: () => void
  onDevolverVenda: () => void
}

function HistoricoFerramentas({
  m,
  temSelecao,
  temItens,
  podeCancelarOuDevolver,
  carregandoDevolucao,
  onImprimirCupom,
  onExportarLista,
  onExportarDetalhe,
  onCancelarVenda,
  onDevolverVenda,
}: FerramentasProps) {
  const btnClass = "h-9 w-full justify-start text-xs"
  return (
    <aside className="flex w-44 shrink-0 flex-col gap-2 border-l border-jl-border-1 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-jl-fg-3">
        {m.caixa.historico_ferramentas}
      </p>
      <Button
        type="button"
        variant="secondary"
        className={btnClass}
        disabled={!temSelecao || !temItens}
        onClick={onImprimirCupom}
      >
        {m.caixa.historico_tool_imprimir_cupom}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={btnClass}
        disabled
        title={m.caixa.historico_tool_etiqueta_todo}
      >
        {m.caixa.historico_tool_imprimir_etiqueta}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={btnClass}
        onClick={onExportarDetalhe}
        disabled={!temSelecao || !temItens}
      >
        {m.caixa.historico_tool_exportar_detalhe}
      </Button>
      <Button type="button" variant="secondary" className={btnClass} onClick={onExportarLista}>
        {m.caixa.historico_exportar}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={btnClass}
        disabled
        title={m.caixa.historico_tool_nfe_todo}
      >
        {m.caixa.historico_tool_gerar_nfe}
      </Button>
      <div className="mt-1 border-t border-jl-border-1 pt-2" />
      <Button
        type="button"
        variant="secondary"
        className={cn(btnClass, "text-red-400 hover:text-red-300")}
        disabled={!podeCancelarOuDevolver}
        onClick={onCancelarVenda}
      >
        {m.caixa.historico_tool_cancelar_venda}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={btnClass}
        disabled={!podeCancelarOuDevolver || carregandoDevolucao}
        onClick={onDevolverVenda}
      >
        {m.caixa.historico_tool_devolver_venda}
      </Button>
    </aside>
  )
}

export function CaixaHistoricoSheet({ open, onOpenChange, m, perfil, onImprimirCupom }: Props) {
  const [vendas, setVendas] = useState<HistoricoVendaOperador[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<HistoricoVendaDetalhe | null>(null)
  const [detalheLoading, setDetalheLoading] = useState(false)
  const tituloId = useId()

  // Fase 5, Entrega 2 — cancelamento/devolução direto do caixa.
  const autorizacaoGerente = useAutorizacaoGerentePontual(m)
  const [gerenteToken, setGerenteToken] = useState<string | null>(null)
  const [cancelarModalAberto, setCancelarModalAberto] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [erroCancelar, setErroCancelar] = useState<string | null>(null)
  const [devolverModalAberto, setDevolverModalAberto] = useState(false)
  const [vendaParaDevolucao, setVendaParaDevolucao] = useState<VendaDetalhe | null>(null)
  const [carregandoVendaDevolucao, setCarregandoVendaDevolucao] = useState(false)

  const fechar = useCallback(() => onOpenChange(false), [onOpenChange])

  const podeAgirDireto = perfil !== null && PERFIS_GERENTE.includes(perfil)

  useEffect(() => {
    if (!open) return
    let cancel = false
    ;(async () => {
      setLoading(true)
      setErro(null)
      setSelecionadoId(null)
      setDetalhe(null)
      const res = await listarHistoricoOperadorCaixa()
      if (cancel) return
      if (!res.ok) {
        setErro(res.error)
        setVendas([])
      } else {
        setVendas(res.vendas)
        if (res.vendas.length > 0) setSelecionadoId(res.vendas[0].id)
      }
      setLoading(false)
    })()
    return () => {
      cancel = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !selecionadoId) {
      setDetalhe(null)
      return
    }
    let cancel = false
    ;(async () => {
      setDetalheLoading(true)
      const res = await obterDetalheHistoricoVendaCaixa(selecionadoId)
      if (cancel) return
      setDetalhe(res.ok ? res.detalhe : null)
      setDetalheLoading(false)
    })()
    return () => {
      cancel = true
    }
  }, [open, selecionadoId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        fechar()
      }
    }
    document.body.style.overflow = "hidden"
    globalThis.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      globalThis.removeEventListener("keydown", onKey)
    }
  }, [open, fechar])

  const refrescarAposAcao = useCallback(async () => {
    const res = await listarHistoricoOperadorCaixa()
    if (res.ok) setVendas(res.vendas)
    if (selecionadoId) {
      const det = await obterDetalheHistoricoVendaCaixa(selecionadoId)
      setDetalhe(det.ok ? det.detalhe : null)
    }
  }, [selecionadoId])

  const abrirModalParaAcao = useCallback(
    async (acao: "cancelar" | "devolver") => {
      if (acao === "cancelar") {
        setErroCancelar(null)
        setCancelarModalAberto(true)
        return
      }
      if (!selecionadoId) return
      setCarregandoVendaDevolucao(true)
      const res = await obterVendaDetalheParaDevolucaoCaixa(selecionadoId)
      setCarregandoVendaDevolucao(false)
      if (!res.ok) {
        setErro(res.error)
        return
      }
      setVendaParaDevolucao(res.venda)
      setDevolverModalAberto(true)
    },
    [selecionadoId],
  )

  const iniciarAcao = useCallback(
    (acao: "cancelar" | "devolver") => {
      if (!selecionadoId || !detalhe) return
      if (String(detalhe.status ?? "").toUpperCase() === "CANCELADA") return
      if (podeAgirDireto) {
        setGerenteToken(null)
        void abrirModalParaAcao(acao)
        return
      }
      const operation =
        acao === "cancelar" ? OperacaoPrivilegiada.CANCELAR_VENDA : OperacaoPrivilegiada.DEVOLVER_VENDA
      autorizacaoGerente.solicitar(operation, (token) => {
        setGerenteToken(token)
        void abrirModalParaAcao(acao)
      })
    },
    [selecionadoId, detalhe, podeAgirDireto, abrirModalParaAcao, autorizacaoGerente],
  )

  const handleConfirmarCancelamento = useCallback(
    async (motivo: string) => {
      if (!selecionadoId) return
      setCancelando(true)
      setErroCancelar(null)
      try {
        const res = await cancelarVenda(selecionadoId, motivo, gerenteToken)
        if (!res.ok) {
          setErroCancelar(res.error)
          return
        }
        setCancelarModalAberto(false)
        setGerenteToken(null)
        await refrescarAposAcao()
      } finally {
        setCancelando(false)
      }
    },
    [selecionadoId, gerenteToken, refrescarAposAcao],
  )

  const handleConcluidoDevolucao = useCallback(() => {
    setGerenteToken(null)
    setVendaParaDevolucao(null)
    void refrescarAposAcao()
  }, [refrescarAposAcao])

  if (!open) return null

  const temItens = (detalhe?.itens.length ?? 0) > 0
  const podeCancelarOuDevolver =
    !!selecionadoId &&
    !!detalhe &&
    String(detalhe.status ?? "").toUpperCase() !== "CANCELADA"

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <div className="absolute inset-0 bg-black/60" onClick={fechar} aria-hidden />
      <div
        className="relative z-10 flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-jl-border-1 bg-jl-surface-elev text-jl-fg-1 shadow-xl"
        data-caixa-atalho-bloqueado="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-jl-border-1 px-4 py-3">
          <div>
            <h2 id={tituloId} className="text-base font-semibold">
              {m.caixa.historico_titulo}
            </h2>
            <p className="mt-0.5 text-xs text-jl-fg-3">{m.caixa.historico_subtitulo}</p>
          </div>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-jl-fg-3 hover:bg-white/10"
            aria-label={m.comum.fechar}
            onClick={fechar}
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="flex w-[38%] min-w-0 flex-col border-r border-jl-border-1">
            {loading ? (
              <p className="px-3 py-4 text-sm text-jl-fg-3">{m.comum.carregando}</p>
            ) : null}
            {erro ? (
              <p className="px-3 py-4 text-sm text-destructive" role="alert">
                {erro}
              </p>
            ) : null}
            {!loading && !erro && vendas.length === 0 ? (
              <p className="px-3 py-4 text-sm italic text-jl-fg-3">{m.caixa.historico_vazio}</p>
            ) : null}
            {!loading && !erro && vendas.length > 0 ? (
              <HistoricoLista
                vendas={vendas}
                selecionadoId={selecionadoId}
                m={m}
                onSelect={setSelecionadoId}
              />
            ) : null}
          </section>

          <section className="flex min-w-0 flex-1 flex-col px-4 py-3">
            <HistoricoDetalhe detalhe={detalhe} carregando={detalheLoading} m={m} />
          </section>

          <HistoricoFerramentas
            m={m}
            temSelecao={!!selecionadoId}
            temItens={temItens}
            podeCancelarOuDevolver={podeCancelarOuDevolver}
            carregandoDevolucao={carregandoVendaDevolucao}
            onImprimirCupom={() => {
              if (selecionadoId) onImprimirCupom?.(selecionadoId)
            }}
            onExportarLista={() => exportarListaCsv(vendas)}
            onExportarDetalhe={() => {
              if (detalhe) exportarDetalheCsv(detalhe)
            }}
            onCancelarVenda={() => iniciarAcao("cancelar")}
            onDevolverVenda={() => iniciarAcao("devolver")}
          />
        </div>

        <footer className="shrink-0 border-t border-jl-border-1 px-4 py-3">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={fechar}>
            {m.comum.fechar}
          </Button>
        </footer>
      </div>

      <CaixaGerenteSenhaModal
        open={autorizacaoGerente.aberto}
        onOpenChange={autorizacaoGerente.setAberto}
        m={m}
        validando={autorizacaoGerente.validando}
        onValidateSenha={autorizacaoGerente.handleValidateSenha}
        onAutorizado={autorizacaoGerente.handleAutorizado}
      />
      <CaixaCancelarVendaModal
        open={cancelarModalAberto}
        onOpenChange={setCancelarModalAberto}
        m={m}
        processing={cancelando}
        erro={erroCancelar}
        onConfirm={(motivo) => void handleConfirmarCancelamento(motivo)}
      />
      <CaixaDevolverVendaModal
        open={devolverModalAberto}
        venda={vendaParaDevolucao}
        gerenteToken={gerenteToken}
        m={m}
        onClose={() => {
          setDevolverModalAberto(false)
          setVendaParaDevolucao(null)
        }}
        onConcluido={handleConcluidoDevolucao}
      />
    </div>
  )
}
