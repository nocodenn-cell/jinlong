'use client'

import { useEffect, useRef, useState } from 'react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/forms'
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {cancelarLabel}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void salvar()}
            disabled={saving || nome.trim().length < 2}
            className="min-w-[100px]"
          >
            {saving ? salvandoLabel : salvarLabel}
          </Button>
        </>
      }
    >
      <Field id="cadastro-rapido-nome" label={nomeLabel}>
        <Input
          id="cadastro-rapido-nome"
          ref={inputRef}
          type="text"
          value={nome}
          maxLength={120}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void salvar()
          }}
          placeholder={nomePlaceholder}
        />
      </Field>
    </DragonModal>
  )
}
