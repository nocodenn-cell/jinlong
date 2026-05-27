'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Search, Download, Plus, FileText, XCircle, DollarSign, FilterX } from 'lucide-react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { Button } from '@/components/ui/button'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { fmtGerenteBRL, fmtGerenteDateTime } from '@/lib/format/gerenteValues'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  buscarContasPagarAction,
  cancelarContaPagarAction,
  exportarContasPagarParaCSVAction,
  type ContaPagarRow,
  type ContasPagarFilters,
} from './actions'
import { PagamentoModal } from './PagamentoModal'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  contasIniciais: ContaPagarRow[]
  hasMoreInicial: boolean
  fornecedoresOpts: Array<{ id: string; nome: string }>
  statusInicial: string
  periodoInicial: string
}>

const STATUS_LIST = ['todos', 'pendente', 'parcial', 'atrasado', 'pago', 'cancelado'] as const

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function relativoVenc(iso: string | null, locale: string): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  const dias = Math.round(ms / 86400000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dias, 'day')
}

function statusClass(s: string): string {
  switch (s.toUpperCase()) {
    case 'PAGO':
      return 'app-badge-positive'
    case 'PARCIAL':
      return 'app-badge-warn'
    case 'ATRASADO':
      return 'app-badge-danger'
    case 'CANCELADO':
      return 'app-badge-neutral line-through'
    default:
      return 'app-badge-neutral'
  }
}

export function ContasPagarListClient({
  idioma,
  locale,
  contasIniciais,
  hasMoreInicial,
  fornecedoresOpts,
  statusInicial,
  periodoInicial,
}: Props) {
  const m = getMessages(idioma)
  const [contas, setContas] = useState<ContaPagarRow[]>(contasIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Filtros
  const [termo, setTermo] = useState('')
  const [status, setStatus] = useState<string>(statusInicial)
  const [fornecedorId, setFornecedorId] = useState('')
  const [periodo, setPeriodo] = useState(periodoInicial)

  // Modal
  const [emPagamento, setEmPagamento] = useState<ContaPagarRow | null>(null)

  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const stateRef = useRef({ hasMore, loading })
  useEffect(() => {
    stateRef.current = { hasMore, loading }
  })

  const filters: ContasPagarFilters = useMemo(
    () => ({
      status,
      fornecedor_id: fornecedorId || undefined,
      periodo: periodo || undefined,
      termo: termo || undefined,
    }),
    [status, fornecedorId, periodo, termo],
  )

  const filtersDebounced = useDebounce(filters, 280)

  const carregarProxima = useCallback(async () => {
    if (stateRef.current.loading || !stateRef.current.hasMore) return
    setLoading(true)
    const prox = pageRef.current + 1
    try {
      const r = await buscarContasPagarAction(prox, filtersDebounced)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      pageRef.current = prox
      setContas((cur) => [...cur, ...r.contas])
      setHasMore(r.hasMore)
    } finally {
      setLoading(false)
    }
  }, [filtersDebounced])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void carregarProxima()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [carregarProxima])

  const skipMountRefetch = useRef(true)

  // Filtros — dispara após debounce
  useEffect(() => {
    if (skipMountRefetch.current) {
      skipMountRefetch.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    pageRef.current = 1
    buscarContasPagarAction(1, filtersDebounced).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        setLoading(false)
        return
      }
      setContas(r.contas)
      setHasMore(r.hasMore)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filtersDebounced])

  function aplicarPagamentoLocal(c: ContaPagarRow) {
    setContas((cur) => cur.map((x) => (x.id === c.id ? c : x)))
  }

  async function onCancelar(c: ContaPagarRow) {
    const motivo = window.prompt(`Motivo do cancelamento de "${c.descricao}":`, '')
    if (motivo == null) return
    if (motivo.trim().length < 2) {
      emitGerenteToast({ kind: 'error', message: 'Motivo deve ter ao menos 2 caracteres.' })
      return
    }
    const r = await cancelarContaPagarAction(c.id, motivo)
    if (!r.ok) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setContas((cur) => cur.map((x) => (x.id === c.id ? { ...x, status: 'CANCELADO' } : x)))
    emitGerenteToast({ kind: 'success', message: m.contas_pagar.toast_cancelada })
  }

  async function onExportar() {
    setExporting(true)
    try {
      const r = await exportarContasPagarParaCSVAction(filters)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      downloadCsvBrowser(
        `gerente-contas-pagar.csv`,
        [
          { key: 'fornecedor', header: m.contas_pagar.col_fornecedor },
          { key: 'descricao', header: m.contas_pagar.col_descricao },
          { key: 'vencimento', header: m.contas_pagar.col_vencimento },
          { key: 'valor_total', header: m.contas_pagar.col_valor },
          { key: 'valor_pago', header: m.contas_pagar.col_valor_pago },
          { key: 'em_aberto', header: m.contas_pagar.col_em_aberto },
          { key: 'status', header: m.contas_pagar.col_status },
          { key: 'nfe', header: m.contas_pagar.col_nfe },
        ],
        r.rows.map((c) => ({
          fornecedor: c.fornecedor_nome ?? '—',
          descricao: c.descricao,
          vencimento: c.vencimento ? new Date(c.vencimento).toISOString().slice(0, 10) : '',
          valor_total: c.valor_total,
          valor_pago: c.valor_pago,
          em_aberto: Number((c.valor_total - c.valor_pago).toFixed(2)),
          status: c.status,
          nfe: c.nfe_numero ?? '',
        })),
      )
    } finally {
      setExporting(false)
    }
  }

  function limparFiltros() {
    setTermo('')
    setStatus('todos')
    setFornecedorId('')
    setPeriodo('')
  }

  // KPIs (sobre o que está carregado + agregados completos pelos filtros)
  const kpis = useMemo(() => {
    let totalAbertos = 0,
      qtdAbertos = 0,
      totalAtrasados = 0,
      qtdAtrasados = 0
    for (const c of contas) {
      const aberto = c.valor_total - c.valor_pago
      if (c.status === 'PENDENTE' || c.status === 'PARCIAL') {
        totalAbertos += aberto
        qtdAbertos++
      }
      if (c.status === 'ATRASADO') {
        totalAtrasados += aberto
        qtdAtrasados++
      }
    }
    return { totalAbertos, qtdAbertos, totalAtrasados, qtdAtrasados }
  }, [contas])

  const algumFiltroAtivo = termo || status !== 'todos' || fornecedorId || periodo

  return (
    <>
      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="dragon-glass-card rounded-xl border border-amber-400/40 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">
            {m.contas_pagar.kpi_em_aberto}
          </div>
          <div className="mt-1 text-xl font-bold leading-tight text-amber-400 tabular-nums">
            {fmtGerenteBRL(kpis.totalAbertos, locale)}
          </div>
          <div className="mt-1.5 text-[11px] tabular-nums text-jl-fg-3">
            {kpis.qtdAbertos} {kpis.qtdAbertos === 1 ? m.contas_pagar.conta_sg : m.contas_pagar.conta_pl}
          </div>
        </div>
        <div className="rounded-xl border border-red-400/45 bg-red-950/25 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">
            {m.contas_pagar.kpi_atrasadas}
          </div>
          <div className="mt-1 text-xl font-bold leading-tight text-red-300 tabular-nums">
            {fmtGerenteBRL(kpis.totalAtrasados, locale)}
          </div>
          <div className="mt-1.5 text-[11px] tabular-nums text-jl-fg-3">
            {kpis.qtdAtrasados} {m.contas_pagar.atrasadas}
          </div>
        </div>
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">
            {m.contas_pagar.kpi_filtrado}
          </div>
          <div className="mt-1 text-xl font-bold leading-tight text-jl-fg-1 tabular-nums">
            {contas.length}
          </div>
          <div className="mt-1.5 text-[11px] tabular-nums text-jl-fg-3">
            {m.contas_pagar.contas_carregadas}
          </div>
        </div>
        <div className="dragon-glass-card flex flex-col items-start justify-between rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">
            {m.contas_pagar.acoes_rapidas}
          </div>
          <Button type="button" className="app-btn-accent mt-2 gap-1.5">
            <Plus className="h-4 w-4" aria-hidden /> {m.contas_pagar.lancar}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="dragon-glass-card mb-4 flex flex-wrap items-center gap-2 rounded-xl p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-jl-fg-3" aria-hidden />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={m.contas_pagar.placeholder_busca}
            aria-label={m.contas_pagar.placeholder_busca}
            className="app-input h-9 w-full rounded-md pl-9 pr-3 text-sm shadow-inner"
          />
        </div>

        <input
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          aria-label={m.contas_pagar.filtro_periodo}
          className="app-input h-9 rounded-md px-3 text-sm tabular-nums"
        />

        <select
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          aria-label={m.contas_pagar.filtro_fornecedor}
          className="app-select h-9 min-w-[180px] rounded-md px-3 text-sm"
        >
          <option value="">{m.contas_pagar.todos_fornecedores}</option>
          {fornecedoresOpts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_LIST.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'app-chip rounded-full px-2.5 py-1 text-[11px] font-medium',
                status === s && 'app-chip-active',
              )}
            >
              {m.contas_pagar[`status_${s}` as keyof typeof m.contas_pagar] as string}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {algumFiltroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 text-xs text-jl-fg-3 hover:text-jl-fg-1"
            >
              <FilterX className="h-3 w-3" aria-hidden />
              {m.contas_pagar.limpar_filtros}
            </button>
          )}
          <button
            type="button"
            disabled={exporting || contas.length === 0}
            onClick={() => void onExportar()}
            className={cn(
              'app-btn-neutral inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              (exporting || contas.length === 0) && 'cursor-not-allowed opacity-45',
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {exporting ? m.comum.carregando : m.gerente.exportar_csv}
          </button>
        </div>
      </div>

      <GerenteTable
        tone="dragon"
        compact
        columns={[
          { key: 'fornecedor', header: m.contas_pagar.col_fornecedor, priority: 'primary'     },
          { key: 'descricao',  header: m.contas_pagar.col_descricao                            },
          { key: 'venc',       header: m.contas_pagar.col_vencimento, width: 140               },
          { key: 'valor',      header: m.contas_pagar.col_valor,      width: 200, numeric: true, priority: 'primary' },
          { key: 'status',     header: m.contas_pagar.col_status,     width: 110, align: 'center'                     },
          { key: 'acoes',      header: <span className="sr-only">{m.contas_pagar.col_acoes}</span>, width: 150, align: 'right', priority: 'contextual' },
        ]}
      >
        {contas.map((c) => {
          const aberto = c.valor_total - c.valor_pago
          const pct = c.valor_total > 0 ? (c.valor_pago / c.valor_total) * 100 : 0
          const podePagar = c.status !== 'PAGO' && c.status !== 'CANCELADO'
          const ms = c.vencimento ? new Date(c.vencimento).getTime() - Date.now() : 0
          const dias = Math.round(ms / 86400000)
          const vencCls = !podePagar
            ? ''
            : dias < 0
              ? 'text-red-300 font-semibold'
              : dias <= 7
                ? 'text-amber-200'
                : 'text-jl-fg-1/80'

          return (
            <tr key={c.id} className="gerente-fin-row-hover transition-colors">
              <td className="gerente-fin-cell px-3 py-2">
                <strong className="text-jl-fg-1">{c.fornecedor_nome ?? '—'}</strong>
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-jl-fg-1">{c.descricao}</div>
                <div className="mt-0.5 text-[11px] text-jl-fg-3">
                  {m.contas_pagar.lancado_em} {fmtGerenteDateTime(c.criado_em, locale)}
                </div>
                {c.nfe_numero && (
                  <Link
                    href={c.nfe_importacao_id ? `/gerente/estoque/importar-nfe?id=${c.nfe_importacao_id}` : '#'}
                    onClick={(e) => !c.nfe_importacao_id && e.preventDefault()}
                    className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-amber-400 hover:underline"
                  >
                    <FileText className="h-3 w-3" aria-hidden />
                    NF-e #{c.nfe_numero}
                  </Link>
                )}
              </td>
              <td className={cn('gerente-fin-cell px-3 py-2 tabular-nums', vencCls)}>
                {fmtDate(c.vencimento, locale)}
                {podePagar && (
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.10em] opacity-85">
                    {relativoVenc(c.vencimento, locale)}
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="text-right text-sm font-bold tabular-nums text-jl-fg-1">
                  {fmtGerenteBRL(c.valor_total, locale)}
                </div>
                {c.valor_pago > 0 && c.status !== 'CANCELADO' && (
                  <>
                    <div className="mt-0.5 text-right text-[11px] tabular-nums text-jl-fg-3">
                      {m.contas_pagar.pago_label} {fmtGerenteBRL(c.valor_pago, locale)}
                      {aberto > 0.001 && (
                        <>
                          {' · '}
                          {m.contas_pagar.aberto_label}{' '}
                          <strong className="text-amber-400">{fmtGerenteBRL(aberto, locale)}</strong>
                        </>
                      )}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-jl-surface-soft">
                      <div
                        className={cn(
                          'h-full transition-[width] duration-200',
                          c.status === 'PARCIAL'
                            ? 'bg-gradient-to-r from-amber-400 to-amber-700'
                            : 'bg-gradient-to-r from-emerald-400 to-emerald-700',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                )}
              </td>
              <td className="px-3 py-2 text-center">
                <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold', statusClass(c.status))}>
                  {m.contas_pagar[`status_${c.status.toLowerCase()}` as keyof typeof m.contas_pagar] as string ?? c.status}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <div className="gerente-row-actions flex items-center justify-end gap-2">
                  {podePagar && (
                    <button
                      type="button"
                      onClick={() => setEmPagamento(c)}
                      className="app-btn-accent inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold"
                      aria-label={`${m.contas_pagar.registrar_pagamento} — ${c.descricao}`}
                    >
                      <DollarSign className="h-3 w-3" aria-hidden />
                      {m.contas_pagar.btn_pagar}
                    </button>
                  )}
                  {podePagar && (
                    <button
                      type="button"
                      onClick={() => void onCancelar(c)}
                      aria-label={`${m.contas_pagar.cancelar} — ${c.descricao}`}
                      title={m.contas_pagar.cancelar}
                      className="app-btn-neutral inline-flex h-8 w-8 items-center justify-center rounded-md text-red-300 transition-colors hover:border-red-400/50 hover:text-red-200"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )
        })}

        {contas.length === 0 && !loading && (
          <tr>
            <td colSpan={6} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="font-serif text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
                应
              </div>
              <div className="mt-3 text-sm font-semibold text-jl-fg-1">{m.contas_pagar.vazio_titulo}</div>
              <div className="mt-1 text-xs text-jl-fg-3">{m.contas_pagar.vazio_sub}</div>
            </td>
          </tr>
        )}
      </GerenteTable>

      <div ref={sentinelRef} className="h-1" aria-hidden />
      {loading && contas.length === 0 && (
        <p className="mt-4 text-center text-sm opacity-60">{m.comum.carregando ?? 'Carregando…'}</p>
      )}

      {emPagamento && (
        <PagamentoModal
          key={emPagamento.id}
          idioma={idioma}
          locale={locale}
          conta={emPagamento}
          onClose={() => setEmPagamento(null)}
          onPagamentoRegistrado={(c) => {
            aplicarPagamentoLocal(c)
            setEmPagamento(null)
          }}
        />
      )}
    </>
  )
}
