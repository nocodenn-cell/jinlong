'use client'

import { useEffect, useRef, useState } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import type { ContatoGerenteListaRow } from './contatosTypes'

export type ContatoEditDialogProps = Readonly<{
  open: boolean
  row: ContatoGerenteListaRow | null
  m: Mensagens
  saving: boolean
  onClose: () => void
  onSaveCliente: (input: {
    id: string
    nome: string
    documento: string
    telefone: string
    ativo: boolean
  }) => Promise<void>
  onSaveFornecedor: (input: { id: string; nome: string; cnpj: string }) => Promise<void>
}>

export function ContatoEditDialog({
  open,
  row,
  m,
  saving,
  onClose,
  onSaveCliente,
  onSaveFornecedor,
}: ContatoEditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [nome, setNome] = useState('')
  const [doc, setDoc] = useState('')
  const [tel, setTel] = useState('')
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
    setDoc(row.documento ?? '')
    setTel(row.tipo === 'CLIENTE' ? row.telefone ?? '' : '')
    setAtivo(row.tipo === 'CLIENTE' ? row.ativo : true)
  }, [row])

  if (!open || !row) return null

  const titulo = row.tipo === 'CLIENTE' ? m.contatos.modal_editar_cliente : m.contatos.modal_editar_fornecedor

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
          if (row.tipo === 'CLIENTE') {
            await onSaveCliente({
              id: row.id,
              nome,
              documento: doc,
              telefone: tel,
              ativo,
            })
          } else {
            await onSaveFornecedor({ id: row.id, nome, cnpj: doc })
          }
        }}
      >
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <label className="block text-xs font-medium app-muted">
          {m.contatos.label_nome}
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
            required
          />
        </label>
        <label className="block text-xs font-medium app-muted">
          {row.tipo === 'CLIENTE' ? m.contatos.label_documento : m.contatos.label_cnpj}
          <input
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
          />
        </label>
        {row.tipo === 'CLIENTE' ? (
          <>
            <label className="block text-xs font-medium app-muted">
              {m.contatos.label_telefone}
              <input
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="rounded app-border" />
              {m.contatos.label_ativo}
            </label>
          </>
        ) : null}
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
