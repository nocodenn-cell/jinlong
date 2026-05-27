'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Printer, FilterX } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL, fmtGerenteDateTime } from '@/lib/format/gerenteValues'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  buscarRelatorioVendasAvancadoAction,
  type RelatorioVendasAvancadoPayload,
} from './actions'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  deInicial: string
  ateInicial: string
  vendedores: Array<{ id: string; nome: string }>
  categorias: Array<{ id: string; nome: string }>
  inicial: ({ ok: true } & RelatorioVendasAvancadoPayload) | null
}>

const FORMAS_PG = [
  { id: 'DINHEIRO', label: 'Dinheiro' },
  { id: 'PIX', label: 'PIX' },
  { id: 'CARTAO_DEBITO', label: 'Cartão débito' },
  { id: 'CARTAO_CREDITO', label: 'Cartão crédito' },
  { id: 'CREDIARIO', label: 'Crediário' },
]

export function RelatorioVendasClient({
  idioma,
  locale,
  deInicial,
  ateInicial,
  vendedores,
  categorias,
  inicial,
}: Props) {
  const m = getMessages(idioma)
  const [de, setDe] = useState(deInicial)
  const [ate, setAte] = useState(ateInicial)
  const [vendedorId, setVendedorId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [forma, setForma] = useState('')
  const [payload, setPayload] = useState<RelatorioVendasAvancadoPayload | null>(inicial)
  const [loading, setLoading] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await buscarRelatorioVendasAvancadoAction({
        de,
        ate,
        vendedor_id: vendedorId || undefined,
        categoria_id: categoriaId || undefined,
        forma_pagamento: forma || undefined,
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setPayload(r)
    } finally {
      setLoading(false)
    }
  }, [de, ate, vendedorId, categoriaId, forma])

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 280)
    return () => clearTimeout(t)
  }, [carregar])

  function limparFiltros() {
    setDe(deInicial)
    setAte(ateInicial)
    setVendedorId('')
    setCategoriaId('')
    setForma('')
  }

  function exportarCSV() {
    if (!payload) return
    downloadCsvBrowser(
      `relatorio-vendas-${de}-a-${ate}.csv`,
      [
        { key: 'data', header: m.relatorios_vendas.col_data },
        { key: 'id', header: m.relatorios_vendas.col_id },
        { key: 'cliente', header: m.relatorios_vendas.col_cliente },
        { key: 'vendedor', header: m.relatorios_vendas.col_vendedor },
        { key: 'total', header: m.relatorios_vendas.col_total },
        { key: 'forma', header: m.relatorios_vendas.col_forma },
        { key: 'status', header: m.relatorios_vendas.col_status },
      ],
      payload.vendas.map((v) => ({
        data: v.data ?? '',
        id: v.id.slice(0, 8),
        cliente: v.cliente_nome ?? '',
        vendedor: v.vendedor_nome ?? '',
        total: v.total_liquido,
        forma: v.forma_pagamento ?? '',
        status: v.status,
      })),
    )
  }

  function imprimirPDF() {
    window.print()
  }

  const chartData = useMemo(
    () =>
      payload?.serie_por_dia.map((d) => ({
        ...d,
        label: new Date(d.dia + 'T00:00:00').toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
      })) ?? [],
    [payload, locale],
  )

  const totais = payload?.totais ?? {
    faturamento: 0,
    num_concluidas: 0,
    num_canceladas: 0,
    ticket_medio: 0,
  }

  return (
    <>
      {/* Filtros */}
      <div className="dragon-glass-card mb-4 rounded-xl border p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {m.relatorios_vendas.de}
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="app-input h-9 rounded-md px-3 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {m.relatorios_vendas.ate}
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="app-input h-9 rounded-md px-3 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {m.relatorios_vendas.vendedor}
            <select
              value={vendedorId}
              onChange={(e) => setVendedorId(e.target.value)}
              className="app-select h-9 rounded-md px-3 text-sm"
            >
              <option value="">{m.relatorios_vendas.todos}</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {m.relatorios_vendas.categoria}
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="app-select h-9 rounded-md px-3 text-sm"
            >
              <option value="">{m.relatorios_vendas.todas}</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {m.relatorios_vendas.forma}
            <select
              value={forma}
              onChange={(e) => setForma(e.target.value)}
              className="app-select h-9 rounded-md px-3 text-sm"
            >
              <option value="">{m.relatorios_vendas.todas}</option>
              {FORMAS_PG.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={limparFiltros}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <FilterX className="h-3 w-3" aria-hidden />
            {m.relatorios_vendas.limpar_filtros}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={exportarCSV}
            disabled={!payload || payload.vendas.length === 0}
            className="app-btn-neutral inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> {m.gerente.exportar_csv}
          </button>
          <button
            type="button"
            onClick={imprimirPDF}
            className="app-btn-neutral inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden /> {m.relatorios_vendas.exportar_pdf}
          </button>
        </div>
      </div>

      {/* Totais */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="dragon-glass-card rounded-xl border border-amber-400/35 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {m.relatorios_vendas.kpi_faturamento}
          </div>
          <div className="mt-1 text-xl font-bold leading-tight text-amber-400 tabular-nums">
            {fmtGerenteBRL(totais.faturamento, locale)}
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
            {totais.num_concluidas} {m.relatorios_vendas.vendas_concluidas}
          </div>
        </div>
        <div className="dragon-glass-card rounded-xl border p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {m.relatorios_vendas.kpi_ticket}
          </div>
          <div className="mt-1 text-xl font-bold leading-tight text-foreground tabular-nums">
            {fmtGerenteBRL(totais.ticket_medio, locale)}
          </div>
        </div>
        <div className="dragon-glass-card rounded-xl border p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {m.relatorios_vendas.kpi_concluidas}
          </div>
          <div className="mt-1 text-xl font-bold leading-tight text-emerald-300 tabular-nums">
            {totais.num_concluidas}
          </div>
        </div>
        <div className="dragon-glass-card rounded-xl border p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {m.relatorios_vendas.kpi_canceladas}
          </div>
          <div className={cn('mt-1 text-xl font-bold leading-tight tabular-nums',
            totais.num_canceladas > 0 ? 'text-red-300' : 'text-foreground')}>
            {totais.num_canceladas}
          </div>
        </div>
      </div>

      {/* Gráfico Recharts */}
      <div className="dragon-glass-card mb-5 rounded-xl border p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-semibold text-foreground">{m.relatorios_vendas.chart_titulo}</h3>
            <p className="m-0 text-xs text-muted-foreground">
              {chartData.length} {chartData.length === 1 ? m.relatorios_vendas.dia_sg : m.relatorios_vendas.dia_pl}
            </p>
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {m.relatorios_vendas.chart_sem_dados}
          </p>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis
                  dataKey="label"
                  stroke="rgba(148,163,184,0.7)"
                  style={{ fontSize: 11, fontFamily: 'var(--font-numeric)' }}
                />
                <YAxis
                  stroke="rgba(148,163,184,0.7)"
                  style={{ fontSize: 11, fontFamily: 'var(--font-numeric)' }}
                  tickFormatter={(v) => fmtGerenteBRL(Number(v), locale)}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(251,191,36,0.08)' }}
                  contentStyle={{
                    background: 'rgba(2,6,23,0.95)',
                    border: '1px solid rgba(148,163,184,0.38)',
                    borderRadius: 8,
                    color: '#f1f5f9',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [fmtGerenteBRL(value, locale), m.relatorios_vendas.faturamento]}
                />
                <Bar dataKey="total_liquido" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabela */}
      <GerenteTable
        tone="dragon"
        columns={[
          { key: 'data', header: m.relatorios_vendas.col_data },
          { key: 'id', header: m.relatorios_vendas.col_id, width: 100 },
          { key: 'cliente', header: m.relatorios_vendas.col_cliente },
          { key: 'vendedor', header: m.relatorios_vendas.col_vendedor },
          { key: 'total', header: m.relatorios_vendas.col_total, width: 130 },
          { key: 'forma', header: m.relatorios_vendas.col_forma, width: 130 },
          { key: 'status', header: m.relatorios_vendas.col_status, width: 110 },
        ]}
      >
        {(payload?.vendas ?? []).map((v) => (
          <tr key={v.id} className="gerente-fin-row-hover">
            <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 tabular-nums">
              {v.data ? fmtGerenteDateTime(v.data, locale) : '—'}
            </td>
            <td className="gerente-fin-cell px-3 py-3 font-mono text-xs text-muted-foreground">
              #{v.id.slice(0, 8)}
            </td>
            <td className="gerente-fin-cell px-3 py-3">{v.cliente_nome ?? '—'}</td>
            <td className="gerente-fin-cell px-3 py-3 text-xs text-foreground/80">
              {v.vendedor_nome ?? '—'}
            </td>
            <td
              className={cn(
                'gerente-fin-cell px-3 py-3 text-right font-bold tabular-nums',
                v.status === 'CANCELADA' && 'text-muted-foreground line-through',
              )}
            >
              {fmtGerenteBRL(v.total_liquido, locale)}
            </td>
            <td className="gerente-fin-cell px-3 py-3 text-xs">{v.forma_pagamento ?? '—'}</td>
            <td className="px-3 py-3">
              {v.status === 'CONCLUIDA' ? (
                <span className="app-badge-positive inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                  {m.relatorios_vendas.status_concluida}
                </span>
              ) : (
                <span className="app-badge-danger inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                  {m.relatorios_vendas.status_cancelada}
                </span>
              )}
            </td>
          </tr>
        ))}
        {payload && payload.vendas.length === 0 && !loading && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>销</div>
              <div className="mt-3 text-sm font-semibold text-foreground">
                {m.relatorios_vendas.vazio_titulo}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{m.relatorios_vendas.vazio_sub}</div>
            </td>
          </tr>
        )}
      </GerenteTable>

      {loading && (
        <p className="mt-4 text-center text-sm opacity-60">{m.comum.carregando ?? 'Carregando…'}</p>
      )}
    </>
  )
}
