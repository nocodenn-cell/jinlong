'use client'

import { objectsToCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'

type Col<T extends Record<string, unknown>> = { key: keyof T & string; header: string }

type Props<T extends Record<string, unknown>> = {
  label: string
  filename: string
  columns: Col<T>[]
  rows: T[]
  className?: string
}

export function ExportCsvButton<T extends Record<string, unknown>>({
  label,
  filename,
  columns,
  rows,
  className,
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
      className={cn(
        'gerente-btn-csv inline-flex shrink-0 items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors app-btn-neutral',
        rows.length === 0
          ? 'cursor-not-allowed opacity-45'
          : 'shadow-sm',
        className,
      )}
      disabled={rows.length === 0}
    >
      {label}
    </button>
  )
}
