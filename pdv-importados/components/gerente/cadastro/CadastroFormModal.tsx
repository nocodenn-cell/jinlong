'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'

type ModalState<R> =
  | { tipo: 'fechado' }
  | { tipo: 'criar' }
  | { tipo: 'editar'; row: R }

type Props<R> = Readonly<{
  state: ModalState<R>
  onClose: () => void
  onSaved: () => void
  modalId: string
  labels: { nova: string; editar: string; cancelar: string; salvando: string; salvar: string; salvo_sucesso: string }
  onSubmit: (nome: string, state: ModalState<R>) => Promise<void>
  getInitialNome: (state: ModalState<R>) => string
  extraFields?: (state: ModalState<R>) => ReactNode
  nomeLabel: string
  nomePlaceholder: string
}>

export function CadastroFormModal<R>({
  state, onClose, onSaved, modalId, labels,
  onSubmit, getInitialNome, extraFields,
  nomeLabel, nomePlaceholder,
}: Props<R>) {
  const [nome, setNome] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.tipo === 'fechado') return
    setNome(getInitialNome(state))
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [state, getInitialNome])

  const { mutate: salvar, loading } = useGerenteMutation(
    async () => {
      await onSubmit(nome.trim(), state)
      onSaved()
      onClose()
      return null
    },
    { successMessage: labels.salvo_sucesso },
  )

  if (state.tipo === 'fechado') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={modalId}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="dragon-elev-2 relative z-10 w-full max-w-md rounded-2xl p-6">
        <h2 id={modalId} className="mb-5 text-lg font-semibold app-accent-text">
          {state.tipo === 'criar' ? labels.nova : labels.editar}
        </h2>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium app-muted">{nomeLabel}</span>
            <input
              ref={inputRef} type="text" value={nome} maxLength={120}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar(undefined); if (e.key === 'Escape') onClose() }}
              placeholder={nomePlaceholder}
              className="h-10 rounded-lg border px-3 text-sm app-input app-border focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            />
          </label>
          {extraFields?.(state)}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-lg px-4 py-2 text-sm font-medium app-muted transition hover:underline">{labels.cancelar}</button>
          <button type="button" onClick={() => salvar(undefined)} disabled={loading || nome.trim().length < 2}
            className="app-btn-accent inline-flex min-w-[120px] items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50">
            {loading ? labels.salvando : labels.salvar}
          </button>
        </div>
      </div>
    </div>
  )
}
