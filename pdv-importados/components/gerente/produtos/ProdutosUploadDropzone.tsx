'use client'

import { useCallback, useState, useTransition } from 'react'
import { useDropzone } from 'react-dropzone'
import { ImageIcon, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { uploadImagemProduto, removerImagemProduto } from '@/app/gerente/produtos/actions'
import { PRODUTO_IMAGEM_MIMES } from '@/lib/gerente/produtoImagemStorage'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { Mensagens } from '@/i18n/getMessages'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB (UI limit; server still enforces 2 MB)

export type ProdutosUploadDropzoneProps = Readonly<{
  produtoId: string
  imagemAtual?: string | null
  m: Mensagens
  onUploadSuccess: (novaUrl: string) => void
  onRemoveSuccess?: () => void
}>

export function ProdutosUploadDropzone({
  produtoId,
  imagemAtual,
  m,
  onUploadSuccess,
  onRemoveSuccess,
}: ProdutosUploadDropzoneProps) {
  const p = m.produtos
  const [preview, setPreview] = useState<string | null>(imagemAtual ?? null)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
  const [pending, startTransition] = useTransition()

  const processarArquivo = useCallback(
    (file: File) => {
      if (!PRODUTO_IMAGEM_MIMES.includes(file.type as (typeof PRODUTO_IMAGEM_MIMES)[number])) {
        emitGerenteToast({ kind: 'error', message: p.foto_dropzone_formato_invalido })
        return
      }
      if (file.size > MAX_BYTES) {
        emitGerenteToast({ kind: 'error', message: p.foto_dropzone_tamanho_excedido })
        return
      }
      startTransition(async () => {
        const fd = new FormData()
        fd.append('produto_id', produtoId)
        fd.append('file', file)
        const r = await uploadImagemProduto(fd)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        setPreview(r.data.imagem_url)
        emitGerenteToast({ kind: 'success', message: p.foto_atualizada })
        onUploadSuccess(r.data.imagem_url)
      })
    },
    [produtoId, p, onUploadSuccess],
  )

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) processarArquivo(accepted[0])
    },
    [processarArquivo],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxFiles: 1,
    disabled: pending,
    noClick: !!preview, // quando há preview, o clique vai para o botão de trocar
  })

  const confirmarRemocao = useCallback(() => {
    if (pending) return
    setConfirmandoRemocao(true)
  }, [pending])

  const executarRemocao = useCallback(() => {
    setConfirmandoRemocao(false)
    startTransition(async () => {
      const r = await removerImagemProduto(produtoId)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setPreview(null)
      emitGerenteToast({ kind: 'success', message: p.foto_removida })
      onRemoveSuccess?.()
    })
  }, [produtoId, p.foto_removida, onRemoveSuccess])

  if (confirmandoRemocao) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-foreground">{p.foto_dropzone_confirmar_remocao}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmandoRemocao(false)}
            className="h-8 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/60"
          >
            {m.comum.cancelar}
          </button>
          <button
            type="button"
            onClick={executarRemocao}
            className="h-8 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            {p.foto_dropzone_remover}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={[
        'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all',
        pending
          ? 'cursor-not-allowed opacity-60 border-border bg-muted/20'
          : isDragActive
            ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 cursor-copy'
            : 'border-border hover:border-emerald-500 bg-muted/30 cursor-pointer',
      ].join(' ')}
    >
      <input {...getInputProps()} />

      {pending ? (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      ) : preview ? (
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <img
              src={preview}
              alt=""
              className="h-24 w-24 rounded-lg border border-border object-cover shadow-sm"
              loading="lazy"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                // abre o input de arquivo para trocar a imagem
                const inp = (e.currentTarget.closest('[data-dropzone-root]') ?? document)
                  .querySelector('input[type=file]') as HTMLInputElement | null
                inp?.click()
              }}
              disabled={pending}
              className="h-7 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              {p.foto_dropzone_trocar}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); confirmarRemocao() }}
              disabled={pending}
              aria-label={p.foto_dropzone_remover}
              className="flex h-7 items-center gap-1 rounded-md border border-destructive/40 bg-background px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              {p.foto_dropzone_remover}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          {isDragActive ? (
            <UploadCloud className="h-8 w-8 text-emerald-500" aria-hidden />
          ) : (
            <ImageIcon className="h-8 w-8" aria-hidden />
          )}
          <p className="text-xs leading-relaxed">{p.foto_dropzone_arrastar}</p>
          <p className="text-[10px] opacity-60">JPEG · PNG · WebP · máx 5 MB</p>
        </div>
      )}
    </div>
  )
}
