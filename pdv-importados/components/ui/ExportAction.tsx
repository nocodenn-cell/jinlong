'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ExportFormat = 'csv' | 'pdf'

type ExportActionProps = {
  format: ExportFormat
  label: string
  onExport: () => void | Promise<void>
  disabled?: boolean
  loading?: boolean
  className?: string
}

/**
 * ExportAction — export canônico csv|pdf (Sprint 0 / IX-EXPORT).
 * XLSX fora do contrato até decisão de produto.
 */
export function ExportAction({
  format,
  label,
  onExport,
  disabled,
  loading,
  className,
}: ExportActionProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={disabled}
      loading={loading}
      onClick={() => void onExport()}
      data-export-format={format}
    >
      <Download className="mr-1.5 size-3.5" aria-hidden />
      {label}
    </Button>
  )
}

/** Helper de download de texto (CSV). */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
