'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { DataTablePage } from '@/components/gerente/DataTablePage'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { labelFormaPagamentoVenda, labelStatusVenda } from '@/lib/format/vendaLabels'
import { cn } from '@/lib/utils'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import {
  buscarVendasPaginadasAction,
  obterKpisVendas,
  obterVendasCompletaParaExport,
  type VendaListRow,
  type VendasFiltro,
} from './actions'
import { VendaActionsMenu } from './VendaActionsMenu'
import { VendaCancelarModal } from './VendaCancelarModal'

type PeriodoPreset = 'hoje' | 'ontem' | '7d' | 'mes' | 'tudo'

const PERIODOS: ReadonlyArray<{ key: PeriodoPreset; label: string }> = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: 'mes', label: 'Mês' },
  { key: 'tudo', label: 'Tudo' },
]

const FORMAS_PAGAMENTO: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CARTAO_DEBITO', label: 'Cartão débito' },
  { value: 'CARTAO_CREDITO', label: 'Cartão crédito' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'OUTROS', label: 'Outros' },
]

function computeIntervalo(p: PeriodoPreset): { inicio: string | null; fim: string | null } {
  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  switch (p) {
    case 'hoje':
      return { inicio: startOfDay.toISOString(), fim: endOfDay.toISOString() }
    case 'ontem': {
      const yest = new Date(startOfDay)
      yest.setDate(yest.getDate() - 1)
      const yestEnd = new Date(yest)
      yestEnd.setHours(23, 59, 59, 999)
      return { inicio: yest.toISOString(), fim: yestEnd.toISOString() }
    }
    case '7d': {
      const wk = new Date(startOfDay)
      wk.setDate(wk.getDate() - 6)
      return { inicio: wk.toISOString(), fim: endOfDay.toISOString() }
    }
    case 'mes': {
      const m1 = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      return { inicio: m1.toISOString(), fim: endOfDay.toISOString() }
    }
    case 'tudo':
      return { inicio: null, fim: null }
  }
}

function statusBadgeClasses(status: string): string {
  const s = status.toUpperCase()
  if (s === 'CANCELADA') return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-danger'
  if (s === 'CONCLUIDA') return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-positive'
  return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-btn-neutral'
}

function diaChave(iso: string | null): string {
  if (!iso) return 'sem-data'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sem-data'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diaLabel(iso: string | null, locale: string): string {
  if (!iso) return 'Sem data'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Sem data'
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(d)
  alvo.setHours(0, 0, 0, 0)
  const deltaDias = Math.round((hoje.getTime() - alvo.getTime()) / 86_400_000)
  if (deltaDias === 0) return 'Hoje'
  if (deltaDias === 1) return 'Ontem'
  return d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

type GrupoDia = {
  chave: string
  label: string
  vendas: VendaListRow[]
  totalDia: number
  qtdConcluidas: number
}

function agruparPorDia(vendas: VendaListRow[], locale: string): GrupoDia[] {
  const map = new Map<string, GrupoDia>()
  for (const v of vendas) {
    const chave = diaChave(v.data)
    const total = Number(v.total_liquido ?? 0)
    const ehConcluida = String(v.status ?? '').toUpperCase() === 'CONCLUIDA'
    const existing = map.get(chave)
    if (existing) {
      existing.vendas.push(v)
      if (ehConcluida) {
        existing.totalDia += total
        existing.qtdConcluidas++
      }
    } else {
      map.set(chave, {
        chave,
        label: diaLabel(v.data, locale),
        vendas: [v],
        totalDia: ehConcluida ? total : 0,
        qtdConcluidas: ehConcluida ? 1 : 0,
      })
    }
  }
  return [...map.values()]
}

function formatPreviewItens(v: VendaListRow): string {
  const { qtd_itens_distintos: distintos, qtd_itens_total: total, primeiro_produto: nome } = v
  if (distintos === 0 || !nome) return '—'
  const safeName = nome.length > 28 ? `${nome.slice(0, 28).trim()}…` : nome
  if (distintos === 1) {
    return total > 1 ? `${total}× ${safeName}` : safeName
  }
  return `${safeName} +${distintos - 1}`
}

function PeriodoChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
        active
          ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
          : 'border-jl-border-1 bg-jl-surface-base text-jl-fg-3 hover:text-jl-fg-1',
      )}
    >
      {children}
    </button>
  )
}

function KpiCard({
  label,
  value,
  accent,
  active,
  onClick,
  loading,
}: {
  label: string
  value: string
  accent: 'neutral' | 'green' | 'red' | 'amber'
  active?: boolean
  onClick?: () => void
  loading?: boolean
}) {
  const clickable = typeof onClick === 'function'
  const Tag = clickable ? 'button' : 'div'
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-[border-color,background-color] duration-150',
        clickable && 'hover:border-jl-fg-3/50',
        active
          ? accent === 'red'
            ? 'border-red-500/40 bg-red-500/10 ring-1 ring-red-500/20'
            : accent === 'green'
              ? 'border-emerald-500/40 bg-emerald-500/10 ring-1 ring-emerald-500/20'
              : accent === 'amber'
                ? 'border-amber-500/40 bg-amber-500/10 ring-1 ring-amber-500/20'
                : 'border-jl-fg-3/40 bg-jl-surface-elev ring-1 ring-jl-fg-3/10'
          : 'border-jl-border-1 bg-jl-surface-base',
      )}
    >
      <span
        className={cn(
          'text-2xl font-bold tabular-nums leading-tight',
          active && accent === 'red'
            ? 'text-red-400'
            : active && accent === 'green'
              ? 'text-emerald-400'
              : active && accent === 'amber'
                ? 'text-amber-400'
                : 'text-jl-fg-1',
        )}
      >
        {loading ? '…' : value}
      </span>
      <span className="text-xs text-jl-fg-3">{label}</span>
    </Tag>
  )
}

type Props = {
  idioma: Idioma
  locale: string
}

export function VendasGerenteListClient({ idioma, locale }: Props) {
  const m = getMessages(idioma)

  const [periodo, setPeriodo] = useState<PeriodoPreset>('mes')
  const [statusSel, setStatusSel] = useState<string>('')
  const [pagamentoSel, setPagamentoSel] = useState<string>('')

  const filtros = useMemo<VendasFiltro>(() => {
    const { inicio, fim } = computeIntervalo(periodo)
    return {
      inicio,
      fim,
      status: statusSel ? [statusSel] : [],
      formaPagamento: pagamentoSel ? [pagamentoSel] : [],
    }
  }, [periodo, statusSel, pagamentoSel])

  const [vendas, setVendas] = useState<VendaListRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [vendaCancelar, setVendaCancelar] = useState<VendaListRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // KPI query — refetches whenever filtros change
  const kpiFn = useCallback(() => obterKpisVendas(filtros), [filtros])
  const { data: kpis, loading: kpisLoading, refetch: refetchKpis } = useGerenteQuery(kpiFn)

  // Stable ref so the IntersectionObserver doesn't need to be rebuilt every render
  const stateRef = useRef({ hasMore, loading, filtros })
  useEffect(() => {
    stateRef.current = { hasMore, loading, filtros }
  })

  // Reset and reload list whenever filtros change
  useEffect(() => {
    let cancelled = false
    pageRef.current = 1
    setLoading(true)
    buscarVendasPaginadasAction(1, filtros)
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setVendas(result.vendas)
          setHasMore(result.hasMore)
        } else {
          emitGerenteToast({ kind: 'error', message: result.error })
          setVendas([])
          setHasMore(false)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filtros])

  const loadNextPage = useCallback(async () => {
    if (stateRef.current.loading || !stateRef.current.hasMore) return
    setLoading(true)
    const nextPage = pageRef.current + 1
    try {
      const result = await buscarVendasPaginadasAction(nextPage, stateRef.current.filtros)
      if (!result.ok) {
        emitGerenteToast({ kind: 'error', message: result.error })
        return
      }
      pageRef.current = nextPage
      setVendas((prev) => [...prev, ...result.vendas])
      setHasMore(result.hasMore)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadNextPage()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadNextPage])

  function toggleStatusFromKpi(target: 'CONCLUIDA' | 'CANCELADA') {
    setStatusSel((prev) => (prev === target ? '' : target))
  }

  const grupos = useMemo(() => agruparPorDia(vendas, locale), [vendas, locale])

  async function handleExportCsv() {
    if (exporting) return
    setExporting(true)
    emitGerenteToast({ kind: 'info', message: 'Gerando CSV com os filtros atuais…' })
    try {
      const todas = await obterVendasCompletaParaExport(filtros)
      if (todas.length === 0) {
        emitGerenteToast({ kind: 'info', message: 'Nenhuma venda no período filtrado.' })
        return
      }
      const hoje = new Date().toISOString().slice(0, 10)
      downloadCsvBrowser(
        `gerente-vendas-${hoje}.csv`,
        [
          { key: 'data', header: m.gerente.col_data },
          { key: 'total_liquido', header: m.gerente.col_total },
          { key: 'forma_pagamento', header: m.gerente.col_forma },
          { key: 'status', header: m.gerente.col_status },
          { key: 'caixa_id', header: m.gerente.col_caixa },
          { key: 'qtd_itens', header: 'Qtd. unidades' },
          { key: 'qtd_distintos', header: 'Itens distintos' },
          { key: 'primeiro_produto', header: 'Produto principal' },
          { key: 'venda_id', header: 'ID' },
        ],
        todas.map((v) => ({
          data: v.data ? new Date(v.data).toISOString() : '',
          total_liquido: Number(v.total_liquido ?? 0),
          forma_pagamento: labelFormaPagamentoVenda(v.forma_pagamento, m),
          status: labelStatusVenda(v.status, m),
          caixa_id: v.caixa_id ?? '',
          qtd_itens: v.qtd_itens_total,
          qtd_distintos: v.qtd_itens_distintos,
          primeiro_produto: v.primeiro_produto ?? '',
          venda_id: v.id,
        })),
      )
      emitGerenteToast({
        kind: 'success',
        message: `${todas.length} ${todas.length === 1 ? 'venda exportada' : 'vendas exportadas'}.`,
      })
    } catch (e) {
      emitGerenteToast({
        kind: 'error',
        message: e instanceof Error ? e.message : m.comum.erro,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <DataTablePage
        kpis={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Faturado no período"
              value={fmtGerenteBRL(kpis?.faturado ?? 0, locale)}
              accent="neutral"
              loading={kpisLoading}
            />
            <KpiCard
              label="Vendas concluídas"
              value={String(kpis?.qtdConcluidas ?? 0)}
              accent="green"
              active={statusSel === 'CONCLUIDA'}
              onClick={() => toggleStatusFromKpi('CONCLUIDA')}
              loading={kpisLoading}
            />
            <KpiCard
              label="Ticket médio"
              value={fmtGerenteBRL(kpis?.ticketMedio ?? 0, locale)}
              accent="neutral"
              loading={kpisLoading}
            />
            <KpiCard
              label={`Canceladas${kpis && kpis.valorCanceladas > 0 ? ` · ${fmtGerenteBRL(kpis.valorCanceladas, locale)}` : ''}`}
              value={String(kpis?.qtdCanceladas ?? 0)}
              accent="red"
              active={statusSel === 'CANCELADA'}
              onClick={() => toggleStatusFromKpi('CANCELADA')}
              loading={kpisLoading}
            />
          </div>
        }
        filters={
          <>
            {PERIODOS.map((p) => (
              <PeriodoChip key={p.key} active={periodo === p.key} onClick={() => setPeriodo(p.key)}>
                {p.label}
              </PeriodoChip>
            ))}
            <select
              value={statusSel}
              onChange={(e) => setStatusSel(e.target.value)}
              className="h-8 w-[160px] rounded-lg border border-jl-border-1 bg-jl-surface-base px-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              <option value="">Todos os status</option>
              <option value="CONCLUIDA">{labelStatusVenda('CONCLUIDA', m)}</option>
              <option value="CANCELADA">{labelStatusVenda('CANCELADA', m)}</option>
            </select>
            <select
              value={pagamentoSel}
              onChange={(e) => setPagamentoSel(e.target.value)}
              className="h-8 w-[180px] rounded-lg border border-jl-border-1 bg-jl-surface-base px-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              <option value="">Todos os pagamentos</option>
              {FORMAS_PAGAMENTO.map((fp) => (
                <option key={fp.value} value={fp.value}>
                  {fp.label}
                </option>
              ))}
            </select>
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={exporting}
            className={cn(
              'gerente-btn-csv inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-sm font-medium transition-colors app-btn-neutral',
              exporting && 'cursor-not-allowed opacity-60',
            )}
          >
            {exporting ? 'Exportando…' : m.gerente.exportar_csv}
          </button>
        }
        pagination={<div ref={sentinelRef} className="h-1 w-full" aria-hidden />}
      >

      <GerenteTable
        tone="dragon"
        compact
        loading={loading && vendas.length === 0}
        columns={[
          { key: 'data',   header: m.gerente.col_data },
          { key: 'total',  header: m.gerente.col_total,  numeric: true,  priority: 'primary'     },
          { key: 'itens',  header: 'Itens',              numeric: true                             },
          { key: 'forma',  header: m.gerente.col_forma },
          { key: 'status', header: m.gerente.col_status, align: 'center'                           },
          { key: 'caixa',  header: m.gerente.col_caixa,  priority: 'contextual'                    },
          { key: 'acoes',  header: m.gerente.col_acoes,  align: 'right',  width: 48, priority: 'contextual' },
        ]}
      >
        {grupos.flatMap((g) => [
          <tr key={`hdr-${g.chave}`} className="border-y border-jl-border-1 bg-jl-surface-elev/50">
            <td colSpan={7} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-amber-300/90">
                  {g.label}
                </span>
                <span className="text-jl-fg-3">·</span>
                <span className="text-jl-fg-3">
                  {g.qtdConcluidas} {g.qtdConcluidas === 1 ? 'venda concluída' : 'vendas concluídas'}
                </span>
                <span className="text-jl-fg-3">·</span>
                <span className="font-semibold tabular-nums text-jl-fg-1">
                  {fmtGerenteBRL(g.totalDia, locale)}
                </span>
                {g.vendas.length > g.qtdConcluidas && (
                  <>
                    <span className="text-jl-fg-3">·</span>
                    <span className="text-red-400/70">
                      {g.vendas.length - g.qtdConcluidas} canceladas
                    </span>
                  </>
                )}
              </div>
            </td>
          </tr>,
          ...g.vendas.map((v) => (
            <tr key={v.id} className="gerente-fin-row-hover transition-colors">
              <td className="gerente-fin-cell whitespace-nowrap px-3 py-2 tabular-nums text-sm">
                {fmtGerenteDateTime(v.data, locale)}
              </td>
              <td className="gerente-fin-cell whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold text-sm">
                {fmtGerenteBRL(Number(v.total_liquido), locale)}
              </td>
              <td className="gerente-fin-cell max-w-[220px] px-3 py-2">
                <span
                  className="block truncate text-sm text-jl-fg-1"
                  title={v.primeiro_produto ?? undefined}
                >
                  {formatPreviewItens(v)}
                </span>
                {v.qtd_itens_distintos > 0 && (
                  <span className="text-[10px] text-jl-fg-3 tabular-nums">
                    {v.qtd_itens_total} {v.qtd_itens_total === 1 ? 'unid' : 'unids'} ·{' '}
                    {v.qtd_itens_distintos} {v.qtd_itens_distintos === 1 ? 'item' : 'itens'}
                  </span>
                )}
              </td>
              <td className="gerente-fin-cell px-3 py-2 text-sm">
                {labelFormaPagamentoVenda(v.forma_pagamento, m)}
              </td>
              <td className="px-3 py-2 text-center">
                <span className={statusBadgeClasses(v.status ?? '')}>
                  {labelStatusVenda(v.status, m)}
                </span>
              </td>
              <td className="gerente-fin-cell px-3 py-2 font-mono text-xs text-jl-fg-3">
                {fmtGerenteIdCurto(v.caixa_id ?? undefined)}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="gerente-row-actions inline-flex justify-end">
                  <VendaActionsMenu
                    vendaId={v.id}
                    isCancelada={v.status === 'CANCELADA'}
                    labels={{
                      abrirDetalhes: m.gerente.ver_detalhes,
                      imprimirCupom: 'Imprimir cupom',
                      cancelarVenda: m.comum.cancelar,
                      acoesAria: m.gerente.col_acoes,
                    }}
                    onCancelar={() => setVendaCancelar(v)}
                  />
                </div>
              </td>
            </tr>
          )),
        ])}
        {!loading && vendas.length === 0 && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-8 text-center">
              {m.gerente.nenhuma_venda}
            </td>
          </tr>
        )}
      </GerenteTable>
      </DataTablePage>

      <VendaCancelarModal
        venda={vendaCancelar}
        locale={locale}
        m={m}
        onClose={() => setVendaCancelar(null)}
        onCancelado={() => {
          // Atualiza a linha localmente sem refetch completo da página
          setVendas((prev) =>
            prev.map((v) =>
              vendaCancelar && v.id === vendaCancelar.id ? { ...v, status: 'CANCELADA' } : v,
            ),
          )
          void refetchKpis()
        }}
      />
    </>
  )
}
