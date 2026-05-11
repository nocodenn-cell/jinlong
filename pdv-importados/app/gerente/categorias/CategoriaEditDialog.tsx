'use client'

import { useEffect, useRef, useState } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import type { CategoriaRow } from './categoriasTypes'

type Props = Readonly<{
  open: boolean
  row: CategoriaRow | null
  m: Mensagens
  saving: boolean
  onClose: () => void
  onSave: (input: { id: string; nome: string; categoria_pai_id: string; ativo: boolean }) => Promise<void>
}>

export function CategoriaEditDialog({ open, row, m, saving, onClose, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [nome, setNome] = useState('')
  const [pai, setPai] = useState('')
  const [ativo, setAtivo] = useState(true)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) el.showModal()
    else if (el.open) el.close()
  }, [open])

  useEffect(() => {
    if (!row) return
    setNome(row.nome)
    setPai(row.categoria_pai_id ?? '')
    setAtivo(row.ativo)
  }, [row])

  if (!open || !row) return null

  return (
    <dialog
      ref={dialogRef}
      className="dragon-glass-card max-w-md rounded-xl border app-border bg-[color:var(--color-background-surface)] p-0 backdrop:bg-black/40"
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault()
          await onSave({
            id: row.id,
            nome,
            categoria_pai_id: pai,
            ativo,
          })
        }}
      >
        <h2 className="text-sm font-semibold">{m.categorias.modal_editar}</h2>
        <label className="block text-xs font-medium app-muted">
          {m.categorias.label_nome}
          <input
            value={nome}
            onChange={(ev) => ev.target.value.length <= 80 && setNome(ev.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
            required
          />
        </label>
        <label className="block text-xs font-medium app-muted">
          {m.categorias.label_categoria_pai}
          <input
            value={pai}
            onChange={(ev) => setPai(ev.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
            placeholder={m.categorias.placeholder_categoria_pai}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={ativo} onChange={(ev) => setAtivo(ev.target.checked)} className="rounded app-border" />
          {m.categorias.label_ativo}
        </label>
        <div className="mt-2 flex justify-end gap-2 border-t pt-3 app-divider gerente-fin-divider">
          <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium app-btn-neutral" onClick={onClose}>
            {m.comum.cancelar}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold app-btn-accent disabled:opacity-50"
          >
            {saving ? '…' : m.comum.salvar}
          </button>
        </div>
      </form>
    </dialog>
  )
}

