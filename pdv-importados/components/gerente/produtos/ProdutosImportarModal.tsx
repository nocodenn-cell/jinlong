'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { UploadCloud } from 'lucide-react'
import { importarProdutosCsv } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Mensagens } from '@/i18n/getMessages'
import { downloadProdutoImportTemplateCsv } from '@/lib/gerente/produtosCsvContract'
import { interpolateTemplate } from '@/lib/gerente/formatDashboardAtividade'
import { emitGerenteToast } from '@/lib/gerente/toast'

export type ProdutosImportarModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  onImportComplete?: () => void
}>

export function ProdutosImportarModal({
  open,
  onOpenChange,
  m,
  onImportComplete,
}: ProdutosImportarModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [ultimoResumo, setUltimoResumo] = useState<{
    criados: number
    atualizados: number
    falhas: ReadonlyArray<{ linha: number; motivo: string }>
  } | null>(null)
  const [atualizarPorId, setAtualizarPorId] = useState(false)
  const [isPending, startTransition] = useTransition()

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    setFileName(null)
    setSelectedFile(null)
    setUltimoResumo(null)
    setAtualizarPorId(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, fechar])

  const p = m.produtos

  const iniciarImportacao = useCallback(() => {
    if (!selectedFile) {
      emitGerenteToast({ kind: 'error', message: p.import_modal_sem_arquivo })
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('atualizar_por_id', atualizarPorId ? '1' : '')
      const r = await importarProdutosCsv(fd)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        setUltimoResumo(null)
        return
      }
      setUltimoResumo({ criados: r.criados, atualizados: r.atualizados, falhas: r.falhas })
      if (r.criados > 0 || r.atualizados > 0) {
        onImportComplete?.()
      }
      if (r.falhas.length === 0) {
        const partesOk: string[] = []
        if (r.criados > 0) {
          partesOk.push(interpolateTemplate(p.import_resumo_criados, { count: String(r.criados) }))
        }
        if (r.atualizados > 0) {
          partesOk.push(interpolateTemplate(p.import_resumo_atualizados, { count: String(r.atualizados) }))
        }
        const okJoined = partesOk.join(p.import_resumo_separador_ok)
        emitGerenteToast({
          kind: 'success',
          message: okJoined.length > 0 ? okJoined : m.comum.sucesso,
        })
        fechar()
        return
      }
      const partesOk: string[] = []
      if (r.criados > 0) {
        partesOk.push(interpolateTemplate(p.import_resumo_criados, { count: String(r.criados) }))
      }
      if (r.atualizados > 0) {
        partesOk.push(interpolateTemplate(p.import_resumo_atualizados, { count: String(r.atualizados) }))
      }
      const okJoined = partesOk.join(p.import_resumo_separador_ok)
      if (okJoined.length > 0) {
        emitGerenteToast({
          kind: 'info',
          message: interpolateTemplate(p.import_toast_parcial_com_falhas, {
            ok: okJoined,
            count: String(r.falhas.length),
          }),
        })
      } else {
        emitGerenteToast({
          kind: 'error',
          message: interpolateTemplate(p.import_resumo_falhas, {
            count: String(r.falhas.length),
          }),
        })
      }
    })
  }, [selectedFile, atualizarPorId, p, m.comum.sucesso, onImportComplete, fechar])

  if (!open) return null

  const podeImportar = Boolean(selectedFile) && !isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="produtos-importar-titulo"
        className="dragon-elev-2 flex max-h-[90vh] w-full max-w-lg flex-col rounded-none sm:rounded-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-jl-border-1 px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-2">
            <UploadCloud className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
            <CardTitle id="produtos-importar-titulo" className="text-lg font-semibold text-jl-fg-1">
              {p.import_modal_titulo}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="rounded-md border border-[color:var(--accent)]/35 border-l-4 border-l-[color:var(--accent)] bg-[color:var(--surface-soft)] px-3 py-2.5 text-sm text-jl-fg-1">
            <p className="font-medium">{p.import_modal_passo1}</p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--accent)] underline-offset-4 hover:underline"
              onClick={() => downloadProdutoImportTemplateCsv()}
            >
              {p.import_modal_baixar_modelo}
            </button>
          </div>

          <div className="rounded-md border border-jl-border-1 bg-jl-surface-elev/80 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-xs text-jl-fg-1">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded app-border app-surface-soft"
                checked={atualizarPorId}
                disabled={isPending}
                onChange={(e) => {
                  setAtualizarPorId(e.target.checked)
                  setUltimoResumo(null)
                }}
              />
              <span>{p.import_modal_atualizar_por_id}</span>
            </label>
          </div>

          <div className="rounded-md border border-jl-border-1 bg-jl-surface-elev/80 p-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.import_modal_arquivo}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="mt-2 block w-full text-xs text-jl-fg-1 file:mr-2 file:rounded-md file:border file:border-jl-border-1 file:bg-jl-surface-soft file:px-2 file:py-1 file:text-xs"
                disabled={isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setSelectedFile(f)
                  setFileName(f?.name ?? null)
                  setUltimoResumo(null)
                }}
              />
            </label>
            <p className="mt-2 text-xs text-jl-fg-3">
              {fileName ?? p.import_modal_nenhum_arquivo}
            </p>
          </div>

          <p className="text-xs text-jl-fg-3">
            {atualizarPorId ? p.import_modal_fase2_aviso_atualizar_id : p.import_modal_fase2_aviso}
          </p>

          {ultimoResumo && ultimoResumo.falhas.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-jl-fg-1">
              <p className="font-semibold text-amber-900 dark:text-amber-100">{p.import_falhas_titulo}</p>
              <ul className="mt-2 max-h-36 list-inside list-disc space-y-1 overflow-y-auto text-[11px]">
                {ultimoResumo.falhas.slice(0, 40).map((f) => (
                  <li key={`${f.linha}-${f.motivo.slice(0, 24)}`}>
                    <span className="font-mono tabular-nums">L{f.linha}</span>: {f.motivo}
                  </li>
                ))}
              </ul>
              {ultimoResumo.falhas.length > 40 ? (
                <p className="mt-1 text-[11px] text-jl-fg-3">…</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="flex justify-end gap-2 border-t border-jl-border-1 px-4 py-3 sm:px-6">
          <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={isPending}>
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            disabled={!podeImportar}
            className="app-btn-accent"
            title={!selectedFile ? p.import_modal_em_breve_title : undefined}
            onClick={() => void iniciarImportacao()}
          >
            {isPending ? p.import_modal_importando : p.import_modal_em_breve}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
