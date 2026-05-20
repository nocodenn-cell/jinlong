'use client'

import type { ChangeEvent, MouseEvent } from 'react'
import { useCallback, useRef, useTransition } from 'react'
import { ImageIcon, Loader2, X } from 'lucide-react'
import { removerImagemProduto, uploadImagemProduto } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'

export type ProdutoImagemCellProps = Readonly<{
  produtoId: string
  nome: string
  imagemUrl: string | null
  disabled?: boolean
  m: Mensagens
  onDone: () => void
}>

function interpolate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
}

export function ProdutoImagemCell({
  produtoId,
  nome,
  imagemUrl,
  disabled,
  m,
  onDone,
}: ProdutoImagemCellProps) {
  const p = m.produtos
  const inp = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  const aria = imagemUrl
    ? interpolate(p.foto_celula_aria_com, { nome })
    : interpolate(p.foto_celula_aria_sem, { nome })

  const pickFile = useCallback(() => {
    if (pending || disabled) return
    inp.current?.click()
  }, [pending, disabled])

  const onFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (!f) return
      startTransition(async () => {
        const fd = new FormData()
        fd.append('produto_id', produtoId)
        fd.append('file', f)
        const r = await uploadImagemProduto(fd)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: p.foto_atualizada })
        onDone()
      })
    },
    [produtoId, p.foto_atualizada, onDone],
  )

  const remover = useCallback(
    (ev: MouseEvent<HTMLButtonElement>) => {
      ev.stopPropagation()
      if (pending || disabled || !imagemUrl) return
      startTransition(async () => {
        const r = await removerImagemProduto(produtoId)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: p.foto_removida })
        onDone()
      })
    },
    [pending, disabled, imagemUrl, produtoId, p.foto_removida, onDone],
  )

  return (
    <div className="group relative flex h-11 w-11 shrink-0 items-center justify-center">
      <input
        ref={inp}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        disabled={pending || disabled}
        aria-label={aria}
        title={aria}
        onClick={pickFile}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-jl-border-1 bg-white/[0.06] transition hover:bg-white/[0.10] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-jl-fg-3" aria-hidden />
        ) : imagemUrl ? (
          <img src={imagemUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="h-4 w-4 text-jl-fg-3" aria-hidden />
        )}
      </button>
      {imagemUrl && !pending ? (
        <button
          type="button"
          aria-label={p.foto_remover_aria}
          title={p.foto_remover_aria}
          onClick={remover}
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-destructive/30 bg-jl-surface-base text-[10px] font-bold text-destructive opacity-0 shadow transition hover:bg-destructive/10 group-hover:opacity-100"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
