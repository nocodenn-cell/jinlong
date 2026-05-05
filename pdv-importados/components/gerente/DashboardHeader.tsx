import React from 'react'
import { Button } from '@/components/ui/button'
import { FileText, AlertTriangle } from 'lucide-react'
import type { Mensagens } from '@/i18n/getMessages'

interface DashboardHeaderProps {
  m: Mensagens
  documentosFiscaisPendentes: number
}

export function DashboardHeader({ m, documentosFiscaisPendentes }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{m.gerente.inicio}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{m.gerente.bem_vindo_resumo}</p>
      </div>
      
      {documentosFiscaisPendentes > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
            <span className="text-sm font-medium text-foreground">
              {documentosFiscaisPendentes} documentos pendentes
            </span>
          </div>
          <Button className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Processar fila fiscal
          </Button>
        </div>
      )}
    </div>
  )
}
