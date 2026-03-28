'use client'

import { objectsToCsv } from '@/lib/csv'

type Col<T extends Record<string, unknown>> = { key: keyof T & string; header: string }

type Props<T extends Record<string, unknown>> = {
  label: string
  filename: string
  columns: Col<T>[]
  rows: T[]
}

export function ExportCsvButton<T extends Record<string, unknown>>({
  label,
  filename,
  columns,
  rows,
}: Props<T>) {
  function download() {
    const csv = objectsToCsv(columns, rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={download}
      style={{
        padding: '6px 12px',
        fontSize: 13,
        borderRadius: 8,
        border: '1px solid #d1d5db',
        background: '#fff',
        cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
        opacity: rows.length === 0 ? 0.55 : 1,
      }}
      disabled={rows.length === 0}
    >
      {label}
    </button>
  )
}
