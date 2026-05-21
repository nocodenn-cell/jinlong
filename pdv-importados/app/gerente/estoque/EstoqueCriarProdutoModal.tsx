'use client'

import { useEffect, useRef } from 'react'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'

export type EstoqueCriarProdutoPayload = Readonly<{
  nome: string
  codigo_barras: string
  preco_varejo: number
  origem: string
}>

export type EstoqueCriarProdutoModalProps = Readonly<{
  open: boolean
  idioma: Idioma
  saving: boolean
  onClose: () => void
  onSubmit: (payload: EstoqueCriarProdutoPayload) => Promise<boolean>
}>

/**
 * Cadastro rápido de produto a partir da visão de estoque (mesmos campos que /gerente/produtos).
 */
export function EstoqueCriarProdutoModal({
  open,
  idioma,
  saving,
  onClose,
  onSubmit,
}: EstoqueCriarProdutoModalProps) {
  const m = getMessages(idioma)
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

  const finIn =
    'h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring'
  const finSelect = `${finIn} app-select`

  return (
    <dialog
      ref={dialogRef}
      open
      aria-labelledby="estoque-criar-prod-titulo"
      className="fixed inset-0 z-50 m-0 flex min-h-full w-full max-w-none items-center justify-center border-0 bg-black/35 p-4 backdrop:bg-transparent"
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
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg sm:p-5">
        <h2 id="estoque-criar-prod-titulo" className="text-base font-semibold tracking-tight">
          {m.estoque.modal_novo_produto_titulo}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{m.estoque.modal_novo_produto_hint}</p>
        <form
          className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const nome = readFormDataString(fd, 'nome').trim()
            if (!nome) {
              emitGerenteToast({ kind: 'error', message: m.produtos.nome_obrigatorio })
              return
            }
            const ok = await onSubmit({
              nome,
              codigo_barras: readFormDataString(fd, 'codigo_barras'),
              preco_varejo: Number(fd.get('preco_varejo')),
              origem: readFormDataString(fd, 'origem'),
            })
            if (ok) {
              e.currentTarget.reset()
              onClose()
            }
          }}
        >
          <input name="nome" placeholder={m.produtos.nome} className={`${finIn} sm:col-span-2`} autoComplete="off" />
          <input name="codigo_barras" placeholder={m.produtos.codigo_barras} className={finIn} autoComplete="off" />
          <input
            name="preco_varejo"
            type="number"
            step="0.01"
            min="0"
            placeholder={m.produtos.preco_varejo}
            required
            className={finIn}
          />
          <select name="origem" defaultValue="china_manual" className={`${finSelect} sm:col-span-2`}>
            <option value="china_manual">{m.produtos.origem_china}</option>
            <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
          </select>
          <p className="gerente-fin-muted sm:col-span-2 text-xs opacity-80">
            · {m.produtos.codigo_barras_opcional}
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground disabled:opacity-50"
            >
              {m.comum.cancelar}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent"
            >
              {saving ? '…' : m.comum.salvar}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
