'use client'

import Link from 'next/link'
import { Download } from 'lucide-react'
import { useMemo } from 'react'
import { defaultUltimosDiasNoFuso } from '@/lib/relatorios/periodoRelatorio'
import { ROUTES } from '@/lib/navigation/routes'

export type RelatoriosFiltrosLabels = {
  de: string
  ate: string
  aplicar: string
  limpar: string
  exportarCsv: string
  csvFilename: string
  preset7: string
  preset15: string
  preset30: string
  presetsAria: string
  imprimir: string
}

type RelatoriosPeriodFiltersProps = {
  de?: string
  ate?: string
  csvRows: Array<Record<string, string | number>>
  labels: RelatoriosFiltrosLabels
  tab?: string
  /** Preserva aba executiva (`?view=`) ao filtrar período. */
  view?: string
}

function escapeCsv(value: string | number): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0] ?? {})
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h] ?? '')).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function presetHref(dias: number, tab?: string, view?: string): string {
  const { de, ate } = defaultUltimosDiasNoFuso(dias)
  const q = new URLSearchParams({ de, ate })
  if (tab && tab !== 'visao') q.set('tab', tab)
  if (view) q.set('view', view)
  return `${ROUTES.admin.relatorios}?${q.toString()}`
}

function isPresetActive(dias: number, de?: string, ate?: string): boolean {
  const preset = defaultUltimosDiasNoFuso(dias)
  return de === preset.de && ate === preset.ate
}

function limparHref(tab?: string, view?: string): string {
  const q = new URLSearchParams()
  if (tab && tab !== 'visao') q.set('tab', tab)
  if (view) q.set('view', view)
  const qs = q.toString()
  return qs ? `${ROUTES.admin.relatorios}?${qs}` : ROUTES.admin.relatorios
}

export function RelatoriosPeriodFilters({
  de,
  ate,
  csvRows,
  labels,
  tab,
  view,
}: RelatoriosPeriodFiltersProps) {
  const deDefault = useMemo(() => de ?? '', [de])
  const ateDefault = useMemo(() => ate ?? '', [ate])
  const presets = [
    { dias: 7, label: labels.preset7 },
    { dias: 15, label: labels.preset15 },
    { dias: 30, label: labels.preset30 },
  ] as const

  return (
    <form
      method="get"
      className="admin-v2-print-hide sticky top-0 z-10 flex flex-col gap-3 rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3"
    >
      {tab && tab !== 'visao' ? <input type="hidden" name="tab" value={tab} /> : null}
      {view ? <input type="hidden" name="view" value={view} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="admin-v2-segmented flex flex-wrap gap-1"
          role="group"
          aria-label={labels.presetsAria}
        >
          {presets.map((preset) => (
            <Link
              key={preset.dias}
              href={presetHref(preset.dias, tab, view)}
              data-active={isPresetActive(preset.dias, de, ate)}
              className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-caption font-medium transition-colors"
            >
              {preset.label}
            </Link>
          ))}
        </div>
        {!isPresetActive(30, de, ate) ? (
          <Link
            href={limparHref(tab, view)}
            className="text-caption font-medium text-jl-fg-3 underline-offset-2 hover:text-jl-fg-1 hover:underline"
          >
            {labels.limpar}
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-caption text-jl-fg-3">
          {labels.de}
          <input
            name="de"
            type="date"
            defaultValue={deDefault}
            className="admin-v2-input px-2 py-1.5 text-small"
          />
        </label>
        <label className="flex flex-col gap-1 text-caption text-jl-fg-3">
          {labels.ate}
          <input
            name="ate"
            type="date"
            defaultValue={ateDefault}
            className="admin-v2-input px-2 py-1.5 text-small"
          />
        </label>
        <button type="submit" className="admin-v2-btn-primary">
          {labels.aplicar}
        </button>
        <button
          type="button"
          className="admin-v2-btn-secondary"
          onClick={() => downloadCsv(labels.csvFilename, csvRows)}
          disabled={csvRows.length === 0}
          aria-label={labels.exportarCsv}
        >
          <Download size={14} aria-hidden />
          {labels.exportarCsv}
        </button>
      </div>
    </form>
  )
}
