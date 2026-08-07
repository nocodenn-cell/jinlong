'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadTextFile } from '@/lib/ui/downloadTextFile'

export { downloadTextFile }

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

