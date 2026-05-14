'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { aplicarExclusaoOuInativacaoEmLote } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'

function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''))
}

export type ProdutosExcluirLoteModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  produtoIds: readonly string[]
  m: Mensagens
  onLoteAplicadoComSucesso: () => void
}>

export function ProdutosExcluirLoteModal({
  open,
  onOpenChange,
  produtoIds,
  m,
  onLoteAplicadoComSucesso,
}: ProdutosExcluirLoteModalProps) {
  const p = m.produtos
  const [phase, setPhase] = useState<'confirm' | 'loading' | 'done'>('confirm')
  const [resumo, setResumo] = useState<{
    removidos: number
    inativados: number
    ja_inativos: number
    falhas: ReadonlyArray<{ produto_id: string; motivo: string }>
  } | null>(null)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    setPhase('confirm')
    setResumo(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'loading') {
        e.preventDefault()
        fechar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, fechar, phase])

  const confirmar = useCallback(async () => {
    if (produtoIds.length === 0) {
      emitGerenteToast({ kind: 'error', message: p.exclusao_sem_selecao })
      return
    }
    if (produtoIds.length > 100) {
      emitGerenteToast({ kind: 'error', message: p.exclusao_max_selecao })
      return
    }
    setPhase('loading')
    const r = await aplicarExclusaoOuInativacaoEmLote({ produto_ids: [...produtoIds] })
    if (!r.success) {
      emitGerenteToast({ kind: 'error', message: r.error })
      setPhase('confirm')
      return
    }
    setResumo(r.data)
    setPhase('done')
    onLoteAplicadoComSucesso()

    const partes: string[] = []
    if (r.data.removidos > 0) {
      partes.push(interpolate(p.exclusao_resumo_removidos, { n: r.data.removidos }))
    }
    if (r.data.inativados > 0) {
      partes.push(interpolate(p.exclusao_resumo_inativados, { n: r.data.inativados }))
    }
    if (r.data.ja_inativos > 0) {
      partes.push(interpolate(p.exclusao_resumo_ja_inativos, { n: r.data.ja_inativos }))
    }
    if (partes.length > 0) {
      emitGerenteToast({ kind: 'success', message: partes.join(' ') })
    } else if (r.data.falhas.length > 0) {
      emitGerenteToast({ kind: 'info', message: p.exclusao_resumo_somente_falhas })
    }
  }, [produtoIds, p, onLoteAplicadoComSucesso])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase !== 'loading') fechar()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="produtos-excluir-lote-titulo"
        className="dragon-glass-card flex max-h-[90vh] w-full max-w-lg flex-col rounded-none border shadow-xl sm:rounded-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-border px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-2">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <CardTitle id="produtos-excluir-lote-titulo" className="text-lg font-semibold text-foreground">
              {p.exclusao_modal_titulo}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto px-4 py-4 text-sm sm:px-6">
          {phase === 'done' && resumo ? (
            <>
              <ul className="list-inside list-disc space-y-1 text-foreground">
                {resumo.removidos > 0 ? (
                  <li>{interpolate(p.exclusao_resumo_removidos, { n: resumo.removidos })}</li>
                ) : null}
                {resumo.inativados > 0 ? (
                  <li>{interpolate(p.exclusao_resumo_inativados, { n: resumo.inativados })}</li>
                ) : null}
                {resumo.ja_inativos > 0 ? (
                  <li>{interpolate(p.exclusao_resumo_ja_inativos, { n: resumo.ja_inativos })}</li>
                ) : null}
              </ul>
              {resumo.falhas.length > 0 ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                  <p className="font-semibold text-amber-900 dark:text-amber-100">{p.exclusao_falhas_titulo}</p>
                  <ul className="mt-2 max-h-36 list-inside list-disc space-y-1 overflow-y-auto font-mono text-[11px]">
                    {resumo.falhas.slice(0, 30).map((f) => (
                      <li key={`${f.produto_id}-${f.motivo.slice(0, 20)}`}>
                        <span className="tabular-nums">{f.produto_id.slice(0, 8)}…</span>: {f.motivo}
                      </li>
                    ))}
                  </ul>
                  {resumo.falhas.length > 30 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">…</p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="leading-relaxed text-muted-foreground">{p.exclusao_modal_descricao}</p>
          )}
          {phase === 'confirm' ? (
            <p className="text-xs text-muted-foreground">
              {interpolate(p.exclusao_modal_contagem, { n: produtoIds.length })}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          {phase === 'done' ? (
            <Button type="button" className="app-btn-accent" onClick={fechar}>
              {p.exclusao_modal_fechar}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                className="app-btn-neutral"
                onClick={fechar}
                disabled={phase === 'loading'}
                autoFocus={phase === 'confirm'}
              >
                {m.comum.cancelar}
              </Button>
              <Button
                type="button"
                className="app-btn-accent"
                disabled={phase === 'loading' || produtoIds.length === 0 || produtoIds.length > 100}
                onClick={() => void confirmar()}
              >
                {phase === 'loading' ? p.exclusao_modal_processando : p.exclusao_modal_confirmar}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
