'use client'

import { useEffect, useRef, useState } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import type { FormaPagamentoRow } from './formasPagamentoTypes'

type Props = Readonly<{
  open: boolean
  row: FormaPagamentoRow | null
  m: Mensagens
  saving: boolean
  onClose: () => void
  onSave: (input: {
    id: string
    codigo: string
    descricao: string
    tipo: FormaPagamentoRow['tipo']
    ativo: boolean
  }) => Promise<void>
}>

export function FormaPagamentoEditDialog({ open, row, m, saving, onClose, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<FormaPagamentoRow['tipo']>('OUTRO')
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
    setDescricao(row.descricao)
    setTipo(row.tipo)
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
            descricao,
            tipo,
            ativo,
          })
        }}
      >
        <h2 className="text-sm font-semibold">{m.formas_pagamento.modal_editar}</h2>
        <label className="block text-xs font-medium app-muted">
          {m.formas_pagamento.col_codigo}
          <input
            value={codigo}
            onChange={(ev) => setCodigo(ev.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
            required
          />
        </label>
        <label className="block text-xs font-medium app-muted">
          {m.formas_pagamento.col_descricao}
          <input
            value={descricao}
            onChange={(ev) => setDescricao(ev.target.value)}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-input"
            required
          />
        </label>
        <label className="block text-xs font-medium app-muted">
          {m.formas_pagamento.col_tipo}
          <select
            value={tipo}
            onChange={(ev) => setTipo(ev.target.value as FormaPagamentoRow['tipo'])}
            className="mt-1 w-full rounded-md px-3 py-2 text-xs app-select"
          >
            <option value="DINHEIRO">{m.formas_pagamento.tipo_dinheiro}</option>
            <option value="CARTAO">{m.formas_pagamento.tipo_cartao}</option>
            <option value="PIX">{m.formas_pagamento.tipo_pix}</option>
            <option value="BOLETO">{m.formas_pagamento.tipo_boleto}</option>
            <option value="OUTRO">{m.formas_pagamento.tipo_outro}</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={ativo} onChange={(ev) => setAtivo(ev.target.checked)} className="rounded app-border" />
          {m.formas_pagamento.label_ativo}
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

