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
    <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-3.5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
          <Monitor size={16} className="text-zinc-400" aria-hidden />
        </div>
        <div>
          <p className="text-[13px] font-medium text-zinc-100">Frente de caixa (PDV)</p>
          <p className="text-[11px] text-zinc-600">Abrir o caixa do operador em nova aba</p>
        </div>
      </div>
      <a
        href="/caixa"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-white px-4 py-2 text-[12px] font-medium text-zinc-950 transition-colors hover:bg-zinc-100"
      >
        Abrir PDV
      </a>
    </div>
  )
}
