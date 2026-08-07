'use client'

import { ExportAction } from '@/components/ui/ExportAction'
import { downloadTextFile } from '@/lib/ui/downloadTextFile'

type Props = {
  csvRows: Array<Record<string, string | number>>
  label: string
  filename: string
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

export function RelatoriosExportButton({ csvRows, label, filename }: Props) {
  return (
    <ExportAction
      format="csv"
      label={label}
      disabled={csvRows.length === 0}
      onExport={() => {
        const csv = buildCsv(csvRows)
        if (csv) downloadTextFile(filename, csv)
      }}
    />
  )
}
