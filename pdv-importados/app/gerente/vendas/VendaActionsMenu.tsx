'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Eye, MoreVertical, Printer, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = Readonly<{
  vendaId: string
  isCancelada: boolean
  labels: {
    abrirDetalhes: string
    imprimirCupom: string
    cancelarVenda: string
    acoesAria: string
  }
  onCancelar: () => void
}>

export function VendaActionsMenu({ vendaId, isCancelada, labels, onCancelar }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={labels.acoesAria}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
          open
            ? 'border-jl-fg-3/40 bg-white/[0.06]'
            : 'border-jl-border-1 hover:border-jl-fg-3/40 hover:bg-white/[0.04]',
        )}
      >
        <MoreVertical className="h-4 w-4 text-jl-fg-3" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={labels.acoesAria}
          className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-jl-border-1 bg-jl-surface-elev shadow-lg"
        >
          <Link
            href={`/gerente/vendas/${vendaId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-jl-fg-1 transition-colors hover:bg-white/[0.05]"
          >
            <Eye className="h-3.5 w-3.5 shrink-0 text-jl-fg-3" aria-hidden />
            <span>{labels.abrirDetalhes}</span>
          </Link>
          <a
            href={`/gerente/vendas/${vendaId}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-jl-fg-1 transition-colors hover:bg-white/[0.05]"
          >
            <Printer className="h-3.5 w-3.5 shrink-0 text-jl-fg-3" aria-hidden />
            <span>{labels.imprimirCupom}</span>
          </a>
          {!isCancelada && (
            <>
              <div className="border-t border-jl-border-1" aria-hidden />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onCancelar()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/[0.08] hover:text-red-300"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{labels.cancelarVenda}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
