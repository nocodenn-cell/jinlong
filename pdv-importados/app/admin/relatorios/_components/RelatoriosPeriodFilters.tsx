'use client'

import { useMemo } from 'react'
import { downloadTextFile } from '@/lib/ui/downloadTextFile'
import { ExportAction } from '@/components/ui/ExportAction'

export type RelatoriosFiltrosLabels = {
  de: string
  ate: string
  aplicar: string
  exportarCsv: string
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

function buildCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0] ?? {})
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h] ?? '')).join(',')),
  ].join('\n')
}

export function RelatoriosPeriodFilters({ de, ate, csvRows, labels }: RelatoriosPeriodFiltersProps) {
  const deDefault = useMemo(() => de ?? '', [de])
  const ateDefault = useMemo(() => ate ?? '', [ate])

  return (
    <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3">
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
      <ExportAction
        format="csv"
        label={labels.exportarCsv}
        disabled={csvRows.length === 0}
        onExport={() => {
          const csv = buildCsv(csvRows)
          if (csv) downloadTextFile(labels.csvFilename, csv)
        }}
      />
      {/* Botão XLSX removido: era permanentemente `disabled` e prometia uma
          exportação que não existe. Controle que nunca habilita não é estado de
          carregamento — é promessa falsa. Reintroduzir quando a exportação
          existir de fato; o CSV ao lado cobre a necessidade hoje. */}
    </form>
  )
}
