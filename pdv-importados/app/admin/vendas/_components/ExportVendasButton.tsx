'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { obterVendasCompletaParaExport, type VendasFiltro } from '@/app/gerente/vendas/actions'

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ExportVendasButton({
  filtros,
  disabled,
  labels,
}: {
  filtros: VendasFiltro
  disabled?: boolean
  labels: { exportar: string; exportando: string; erro: string }
}) {
  const [pending, start] = useTransition()
  const [erro, setErro] = useState(false)

  const exportar = () =>
    start(async () => {
      setErro(false)
      try {
        const rows = await obterVendasCompletaParaExport(filtros)
        const header = ['venda', 'data', 'status', 'pagamento', 'itens', 'produto', 'bruto', 'liquido']
        const linhas = rows.map((r) =>
          [
            r.id,
            r.data,
            r.status,
            r.forma_pagamento,
            r.qtd_itens_total,
            r.primeiro_produto,
            r.total_bruto,
            r.total_liquido,
          ]
            .map(csvCell)
            .join(';'),
        )
        // BOM para o Excel abrir a acentuação corretamente.
        const blob = new Blob(['﻿' + [header.join(';'), ...linhas].join('\r\n')], {
          type: 'text/csv;charset=utf-8',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vendas-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        setErro(true)
      }
    })

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={disabled || pending}
      title={erro ? labels.erro : undefined}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-caption text-jl-fg-2 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download size={12} aria-hidden />
      {pending ? labels.exportando : erro ? labels.erro : labels.exportar}
    </button>
  )
}
