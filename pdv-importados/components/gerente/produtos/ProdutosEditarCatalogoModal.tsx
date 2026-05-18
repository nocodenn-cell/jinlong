'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { atualizarDadosProdutoGerente } from '@/app/gerente/produtos/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { ProdutosUploadDropzone } from '@/components/gerente/produtos/ProdutosUploadDropzone'
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

type OrigemCode = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

export type ProdutosEditarCatalogoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  produto: ProdutoGerenteRow | null
  m: Mensagens
  onSalvo: () => void
  onImagemAlterada?: () => void
}>

export function ProdutosEditarCatalogoModal({
  open,
  onOpenChange,
  produto,
  m,
  onSalvo,
  onImagemAlterada,
}: ProdutosEditarCatalogoModalProps) {
  const p = m.produtos
  const [nome, setNome] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [temNf, setTemNf] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imagemAtual, setImagemAtual] = useState<string | null>(null)

  useEffect(() => {
    if (open) setImagemAtual(produto?.imagem_url ?? null)
  }, [open, produto])

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open || !produto) return
    setNome(produto.nome)
    setCodigoBarras(produto.codigo_barras ?? '')
    setOrigem(produto.origem as OrigemCode)
    setTemNf(produto.tem_nf)
  }, [open, produto])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault()
        fechar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, fechar, saving])

  const salvar = useCallback(async () => {
    if (!produto) return
    setSaving(true)
    try {
      const r = await atualizarDadosProdutoGerente({
        produto_id: produto.id,
        nome: nome.trim(),
        codigo_barras: codigoBarras.trim(),
        origem,
        tem_nf: temNf,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
      onSalvo()
      fechar()
    } finally {
      setSaving(false)
    }
  }, [produto, nome, codigoBarras, origem, temNf, m.comum.sucesso, onSalvo, fechar])

  if (!open || !produto) return null

  const finIn = 'h-9 w-full rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 w-full rounded-md px-3 text-xs app-select'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) fechar()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="produtos-editar-catalogo-titulo"
        className="dragon-glass-card flex max-h-[90vh] w-full max-w-md flex-col rounded-none border shadow-xl sm:rounded-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-border px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-2">
            <Pencil className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" aria-hidden />
            <CardTitle id="produtos-editar-catalogo-titulo" className="text-lg font-semibold text-foreground">
              {p.editar_modal_titulo}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {produto && (
            <ProdutosUploadDropzone
              produtoId={produto.id}
              imagemAtual={imagemAtual}
              m={m}
              onUploadSuccess={(url) => {
                setImagemAtual(url)
                onImagemAlterada?.()
              }}
              onRemoveSuccess={() => {
                setImagemAtual(null)
                onImagemAlterada?.()
              }}
            />
          )}
          <label className="block text-xs font-medium text-muted-foreground">
            {p.nome}
            <input className={`${finIn} mt-1`} value={nome} onChange={(e) => setNome(e.target.value)} disabled={saving} />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            {p.codigo_barras}
            <input
              className={`${finIn} mt-1 font-mono`}
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(e.target.value)}
              disabled={saving}
              placeholder={p.codigo_barras_opcional}
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            {p.origem_label}
            <select
              className={`${finSelect} mt-1`}
              value={origem}
              onChange={(e) => setOrigem(e.target.value as OrigemCode)}
              disabled={saving}
            >
              <option value="china_manual">{p.origem_china}</option>
              <option value="brasil_nf">{p.origem_brasil_nf}</option>
              <option value="brasil_sem_nf">{p.origem_brasil_sem_nf}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded app-border app-surface-soft"
              checked={temNf}
              onChange={(e) => setTemNf(e.target.checked)}
              disabled={saving}
            />
            {p.tem_nf}
          </label>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={saving}>
            {m.comum.cancelar}
          </Button>
          <Button type="button" className="app-btn-accent" disabled={saving} onClick={() => void salvar()}>
            {saving ? '…' : p.editar_modal_salvar}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
