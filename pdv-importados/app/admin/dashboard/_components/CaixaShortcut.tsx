'use client'

/**
 * FastProduct Admin — CaixaShortcut (Fase 3)
 *
 * Atalho para a frente de caixa (PDV). Abre /caixa em nova aba.
 * Client component minimalista — nenhum dado, nenhuma query.
 */

import { Monitor } from 'lucide-react'

export function CaixaShortcut() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#242424] bg-[#0f0f0f] px-5 py-3.5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-jl-card-l1-accent">
          <Monitor size={16} className="text-jl-accent" aria-hidden />
        </div>
        <div>
          <p className="text-[13px] font-medium text-jl-fg-1">Frente de caixa (PDV)</p>
          <p className="text-[11px] text-jl-fg-3">Abrir o caixa do operador em nova aba</p>
        </div>
      </div>
      <a
        href="/caixa"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-jl-accent/35 bg-jl-card-l1-accent px-4 py-2 text-[12px] font-medium text-jl-accent transition-colors hover:border-jl-accent/50 hover:bg-jl-card-l1-accent/80"
      >
        Abrir PDV
      </a>
    </div>
  )
}
