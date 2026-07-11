'use client'

import { ComissaoHistoricoList } from './ComissaoHistoricoList'

interface Props {
  funcionarioId: string
  onClose: () => void
  locale: string
}

export function ComissaoHistoricoModal({ funcionarioId, onClose, locale }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto dragon-glass-backdrop px-4 py-12"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="dragon-elev-2 w-full max-w-3xl rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-jl-fg-1">Histórico de Comissões</h2>
            <p className="text-xs app-muted mt-1">Registro completo de alterações de regras de comissão</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-jl-fg-3 hover:text-jl-fg-1 transition-colors"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <ComissaoHistoricoList funcionarioId={funcionarioId} locale={locale} />
        </div>

        <div className="border-t border-jl-border-1 bg-jl-surface-elev px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors app-border app-btn-neutral"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
