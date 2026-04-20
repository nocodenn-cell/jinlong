'use client'

import { useEffect, useRef } from 'react'
import type { Mensagens } from '@/src/lib/i18n/getMessages'

export type EstoqueAjusteModalProps = Readonly<{
  open: boolean
  produtoId: string
  produtoNome: string
  quantidadeAtual: number
  estoqueMinimo: number
  saving: boolean
  labels: Readonly<{
    titulo: string
    atual: string
    minimo: string
    salvar: string
    cancelar: string
  }>
  onClose: () => void
  onSubmit: (payload: {
    produto_id: string
    quantidade_atual: number
    estoque_minimo: number
  }) => void
}>

/**
 * Modal de ajuste de quantidade / mínimo (substitui o formulário inline da listagem).
 */
export function EstoqueAjusteModal({
  open,
  produtoId,
  produtoNome,
  quantidadeAtual,
  estoqueMinimo,
  saving,
  labels,
  onClose,
  onSubmit,
}: EstoqueAjusteModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    }
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      open
      aria-labelledby="estoque-ajuste-titulo"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose()
        }
      }}
      style={{
        width: '100%',
        minHeight: '100vh',
        margin: 0,
        padding: 0,
        border: 'none',
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
        }}
      >
        <h2 id="estoque-ajuste-titulo" style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
          {labels.titulo}
        </h2>
        <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 16 }}>{produtoNome}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            onSubmit({
              produto_id: produtoId,
              quantidade_atual: Number(fd.get('quantidade_atual')),
              estoque_minimo: Number(fd.get('estoque_minimo')),
            })
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span style={{ color: '#6b7280' }}>{labels.atual}</span>
            <input
              name="quantidade_atual"
              type="number"
              min={0}
              step="0.001"
              required
              defaultValue={quantidadeAtual}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span style={{ color: '#6b7280' }}>{labels.minimo}</span>
            <input
              name="estoque_minimo"
              type="number"
              min={0}
              step="0.001"
              required
              defaultValue={estoqueMinimo}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {labels.cancelar}
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#111827',
                color: '#fff',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {labels.salvar}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

/** Rótulos derivados das mensagens i18n. */
export function labelsAjusteEstoque(m: Mensagens): EstoqueAjusteModalProps['labels'] {
  return {
    titulo: m.estoque.col_ajuste,
    atual: m.estoque.col_atual,
    minimo: m.estoque.col_minimo,
    salvar: m.estoque.atualizar,
    cancelar: m.comum?.cancelar ?? 'Cancelar',
  }
}
