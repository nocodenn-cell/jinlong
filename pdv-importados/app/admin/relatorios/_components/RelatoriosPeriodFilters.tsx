'use client'

import { Download, FileSpreadsheet } from 'lucide-react'
import { useMemo } from 'react'

export type RelatoriosFiltrosLabels = {
  de: string
  ate: string
  aplicar: string
  exportarCsv: string
  xlsx: string
  csvFilename: string
}

type RelatoriosPeriodFiltersProps = {
  de?: string
  ate?: string
  csvRows: Array<Record<string, string | number>>
  labels: RelatoriosFiltrosLabels
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

export function RelatoriosPeriodFilters({ de, ate, csvRows, labels }: RelatoriosPeriodFiltersProps) {
  const deDefault = useMemo(() => de ?? '', [de])
  const ateDefault = useMemo(() => ate ?? '', [ate])

  return (
    <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-background-secondary)] p-3">
      <label className="flex flex-col gap-1 text-[11px] text-jl-fg-3">
        {labels.de}
        <input name="de" type="date" defaultValue={deDefault} className="admin-v2-input px-2 py-1.5 text-xs" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-jl-fg-3">
        {labels.ate}
        <input name="ate" type="date" defaultValue={ateDefault} className="admin-v2-input px-2 py-1.5 text-xs" />
      </label>
      <button type="submit" className="admin-v2-btn-primary">
        {labels.aplicar}
      </button>
      <button
        type="button"
        className="admin-v2-btn-secondary"
        onClick={() => downloadCsv(labels.csvFilename, csvRows)}
        disabled={csvRows.length === 0}
      >
        <Download size={14} aria-hidden />
        {labels.exportarCsv}
      </button>
      <button type="button" className="admin-v2-btn-secondary opacity-60" disabled>
        <FileSpreadsheet size={14} aria-hidden />
        {labels.xlsx}
      </button>
    </form>
  )
}
