'use client'

import { useEffect, useRef, useState } from 'react'
import { DragonModal } from '@/components/ui/DragonModal'
import { emitGerenteToast } from '@/lib/gerente/toast'

type Props = Readonly<{
  open: boolean
  onClose: () => void
  titulo: string
  nomeLabel: string
  nomePlaceholder: string
  cancelarLabel: string
  salvarLabel: string
  salvandoLabel: string
  onSubmit: (nome: string) => Promise<{ success: boolean; id?: string; error?: string }>
  onCriado: (id: string, nome: string) => void
}>

export function CadastroRapidoNomeModal({
  open,
  onClose,
  titulo,
  nomeLabel,
  nomePlaceholder,
  cancelarLabel,
  salvarLabel,
  salvandoLabel,
  onSubmit,
  onCriado,
}: Props) {
  const [nome, setNome] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setNome('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  async function salvar() {
    const trimmed = nome.trim()
    if (trimmed.length < 2) return
    setSaving(true)
    try {
      const r = await onSubmit(trimmed)
      if (!r.success || !r.id) {
        emitGerenteToast({ kind: 'error', message: r.error ?? 'Erro ao salvar.' })
        return
      }
      onCriado(r.id, trimmed)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <DragonModal
      open
      onClose={onClose}
      title={titulo}
      size="sm"
      dismissable={!saving}
      closeLabel={cancelarLabel}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium app-muted transition hover:underline"
          >
            {cancelarLabel}
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={saving || nome.trim().length < 2}
            className="app-btn-accent inline-flex min-w-[100px] items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? salvandoLabel : salvarLabel}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium app-muted">{nomeLabel}</span>
        <input
          ref={inputRef}
          type="text"
          value={nome}
          maxLength={120}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void salvar()
          }}
          placeholder={nomePlaceholder}
          className="h-10 rounded-lg border px-3 text-sm app-input app-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </label>
    </DragonModal>
  )
}
