'use client'

import { useEffect, useRef, useState } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import type { VendedorGerenteRow } from './vendedoresTypes'

export type VendedorEditDialogProps = Readonly<{
  open: boolean
  row: VendedorGerenteRow | null
  m: Mensagens
  saving: boolean
  onClose: () => void
  onSave: (input: {
    id: string
    codigo: string
    nome: string
    cpf: string
    celular: string
    ativo: boolean
  }) => Promise<void>
}>

export function VendedorEditDialog({ open, row, m, saving, onClose, onSave }: VendedorEditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [celular, setCelular] = useState('')
  const [ativo, setAtivo] = useState(true)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) el.showModal()
    else if (el.open) el.close()
  }, [open])

  useEffect(() => {
    if (!row) return
    setCodigo(row.codigo)
    setNome(row.nome)
    setCpf(row.cpf ?? '')
    setCelular(row.celular ?? '')
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
            codigo,
            nome,
            cpf,
            celular,
            ativo,
          })
        }}
      >
        <h2 className="text-sm font-semibold">{m.vendedores.modal_editar}</h2>
        <label className="block text-xs font-medium app-muted">
          {m.vendedores.col_codigo}
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
            required
          />
        </label>
        <label className="block text-xs font-medium app-muted">
          {m.vendedores.col_nome}
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
            required
          />
        </label>
        <label className="block text-xs font-medium app-muted">
          {m.vendedores.col_cpf}
          <input value={cpf} onChange={(e) => setCpf(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input" />
        </label>
        <label className="block text-xs font-medium app-muted">
          {m.vendedores.col_celular}
          <input value={celular} onChange={(e) => setCelular(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input" />
        </label>
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="rounded app-border" />
          {m.vendedores.label_ativo}
        </label>
        <div className="mt-2 flex justify-end gap-2 border-t pt-3 app-divider gerente-fin-divider">
          <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium app-btn-neutral" onClick={onClose}>
            {m.comum.cancelar}
          </button>
          <button type="submit" disabled={saving} className="rounded-lg px-3 py-1.5 text-xs font-semibold app-btn-accent disabled:opacity-50">
            {saving ? '…' : m.comum.salvar}
          </button>
        </div>
      </form>
    </dialog>
  )
}
