'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Boxes, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { fmtQuantidadeEstoque } from '@/lib/format/fmtQuantidadeEstoque'
import { cn } from '@/lib/utils'

type Operacao = 'entrada' | 'saida' | 'ajuste'

type MotivoOpt = Readonly<{ value: string; label: string; tipo: 'in' | 'out' | 'adj' }>

export type EstoqueAjusteModalProps = Readonly<{
  idioma: Idioma
  produtoId: string
  produtoNome: string
  codigoBarras: string | null
  unidade: string
  quantidadeAtual: number
  estoqueMinimo: number
  saving: boolean
  onClose: () => void
  onSubmit: (payload: {
    produto_id: string
    quantidade_atual: number
    estoque_minimo: number
    motivo: string
    observacao?: string
  }) => Promise<void> | void
}>

function listaMotivos(m: Mensagens): MotivoOpt[] {
  return [
    { value: 'ENTRADA_NFE',       label: m.estoque.motivo_entrada_nfe,       tipo: 'in' },
    { value: 'COMPRA',            label: m.estoque.motivo_compra,            tipo: 'in' },
    { value: 'DEVOLUCAO_CLIENTE', label: m.estoque.motivo_devolucao_cliente, tipo: 'in' },
    { value: 'SAIDA_VENDA',       label: m.estoque.motivo_saida_venda,       tipo: 'out' },
    { value: 'PERDA',             label: m.estoque.motivo_perda,             tipo: 'out' },
    { value: 'QUEBRA',            label: m.estoque.motivo_quebra,            tipo: 'out' },
    { value: 'TRANSFERENCIA',     label: m.estoque.motivo_transferencia,     tipo: 'out' },
    { value: 'ACERTO_INVENTARIO', label: m.estoque.motivo_acerto_inventario, tipo: 'adj' },
    { value: 'OUTRO',             label: m.estoque.motivo_outro,             tipo: 'adj' },
  ]
}

/**
 * Modal de ajuste de estoque — segue o mesmo padrão do `ClienteEditarModal`:
 *   - dragon-glass-card + tokens do design system
 *   - role=dialog + aria-modal + focus trap + ESC fecha
 *   - 3 operações: entrada (in) / saída (out) / acerto (adj)
 *   - Preview em tempo real do estoque resultante
 *   - "OUTRO" exige observação
 *   - Saída não pode exceder o estoque atual
 */
export function EstoqueAjusteModal({
  idioma,
  produtoId,
  produtoNome,
  codigoBarras,
  unidade,
  quantidadeAtual,
  estoqueMinimo,
  saving,
  onClose,
  onSubmit,
}: EstoqueAjusteModalProps) {
  const m = getMessages(idioma)
  const motivos = useMemo(() => listaMotivos(m), [m])

  const [operacao, setOperacao] = useState<Operacao>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [novoMinimo, setNovoMinimo] = useState(String(estoqueMinimo))
  const [motivo, setMotivo] = useState<string>(() => motivos.find((x) => x.tipo === 'in')?.value ?? 'COMPRA')
  const [observacao, setObservacao] = useState('')
  const [erros, setErros] = useState<Record<string, string | null>>({})

  const dialogRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Sincroniza motivo + reset ao mudar operação
  useEffect(() => {
    const tipoEsperado = operacao === 'entrada' ? 'in' : operacao === 'saida' ? 'out' : 'adj'
    const novo = motivos.find((x) => x.tipo === tipoEsperado)
    if (novo) setMotivo(novo.value)
    setQuantidade('')
    if (operacao !== 'ajuste') setNovoMinimo(String(estoqueMinimo))
  }, [operacao, motivos, estoqueMinimo])

  // ESC + lock scroll + focus trap
  useEffect(() => {
    const triggerEl = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => firstFieldRef.current?.focus(), 30)

    const onKey = (e: KeyboardEvent) => {
      if (saving) return
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
        return
      }
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      triggerEl?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving])

  function sujo(): boolean {
    return !!(quantidade || observacao || Number(novoMinimo.replace(',', '.')) !== estoqueMinimo)
  }

  const fechar = useCallback(() => {
    if (sujo() && !confirm(m.estoque.confirmar_descartar)) return
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantidade, observacao, novoMinimo, estoqueMinimo, onClose, m])

  const motivosDoTipo = useMemo(() => {
    const tipoEsperado = operacao === 'entrada' ? 'in' : operacao === 'saida' ? 'out' : 'adj'
    return motivos.filter((x) => x.tipo === tipoEsperado)
  }, [operacao, motivos])

  const qtyNum = Number(quantidade.replace(',', '.')) || 0
  const novoMinNum = Number(novoMinimo.replace(',', '.')) || 0
  const novoEstoque =
    operacao === 'entrada' ? quantidadeAtual + qtyNum :
    operacao === 'saida'   ? quantidadeAtual - qtyNum :
                              qtyNum
  const ficaraCritico = novoEstoque <= novoMinNum

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!quantidade.trim()) e.quantidade = m.estoque.err_qty_obrigatoria
    else if (operacao === 'entrada' && qtyNum <= 0) e.quantidade = m.estoque.err_entrada_positiva
    else if (operacao === 'saida' && qtyNum <= 0) e.quantidade = m.estoque.err_saida_positiva
    else if (operacao === 'saida' && qtyNum > quantidadeAtual)
      e.quantidade = m.estoque.err_saida_excede.replace('{atual}', String(quantidadeAtual))
    else if (operacao === 'ajuste' && qtyNum < 0) e.quantidade = m.estoque.err_negativo
    if (operacao === 'ajuste' && novoMinNum < 0) e.minimo = m.estoque.err_minimo_negativo
    if (motivo === 'OUTRO' && observacao.trim().length < 3) e.observacao = m.estoque.err_outro_observacao
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    await onSubmit({
      produto_id: produtoId,
      quantidade_atual: novoEstoque,
      estoque_minimo: novoMinNum,
      motivo,
      observacao: observacao.trim() || undefined,
    })
  }

  const finIn = 'h-10 w-full rounded-md px-3 text-sm app-input'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) fechar()
      }}
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="estoque-aj-titulo"
        className="dragon-glass-card flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl border shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-border px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" aria-hidden />
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {m.estoque.modal_eyebrow}
                </p>
                <CardTitle id="estoque-aj-titulo" className="truncate text-lg font-semibold text-foreground">
                  {produtoNome}
                </CardTitle>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {codigoBarras ?? '—'} · {unidade}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label={m.comum.fechar ?? 'Fechar'}
              disabled={saving}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md app-border border text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </CardHeader>

        <form onSubmit={submeter} className="flex flex-1 min-h-0 flex-col">
          <CardContent className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            {/* Snapshot atual */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className={cn(
                  'rounded-lg app-border border bg-slate-950/55 px-3.5 py-3',
                  quantidadeAtual <= estoqueMinimo && 'border-red-400/40',
                )}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {m.estoque.modal_estoque_atual}
                </div>
                <div
                  className={cn(
                    'mt-1 text-xl font-bold tabular-nums',
                    quantidadeAtual <= estoqueMinimo ? 'text-red-300' : 'text-foreground',
                  )}
                >
                  {fmtQuantidadeEstoque(quantidadeAtual)}{' '}
                  <span className="text-[10px] font-normal text-muted-foreground">{unidade}</span>
                </div>
              </div>
              <div className="rounded-lg app-border border bg-slate-950/55 px-3.5 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {m.estoque.modal_minimo_atual}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-foreground/85">
                  {fmtQuantidadeEstoque(estoqueMinimo)}{' '}
                  <span className="text-[10px] font-normal text-muted-foreground">{unidade}</span>
                </div>
              </div>
            </div>

            {/* Tipo de operação */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {m.estoque.modal_operacao}
              </span>
              <div
                role="radiogroup"
                aria-label={m.estoque.modal_operacao}
                className="grid grid-cols-3 gap-1 rounded-lg app-border border bg-slate-950/55 p-1"
              >
                {[
                  { id: 'entrada' as const, label: m.estoque.op_entrada, Icon: ArrowUp,    activeCls: 'bg-emerald-900/45 text-emerald-200 border border-emerald-400/40 font-semibold' },
                  { id: 'saida'   as const, label: m.estoque.op_saida,   Icon: ArrowDown,  activeCls: 'bg-red-900/45 text-red-200 border border-red-400/50 font-semibold' },
                  { id: 'ajuste'  as const, label: m.estoque.op_acerto,  Icon: ArrowRight, activeCls: 'bg-gradient-to-b from-amber-300 to-amber-600 text-slate-900 font-semibold' },
                ].map(({ id, label, Icon, activeCls }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={operacao === id}
                    onClick={() => setOperacao(id)}
                    disabled={saving}
                    className={cn(
                      'flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                      operacao === id ? activeCls : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {operacao === 'entrada' && m.estoque.hint_entrada}
                {operacao === 'saida' && m.estoque.hint_saida}
                {operacao === 'ajuste' && m.estoque.hint_acerto}
              </p>
            </div>

            {/* Quantidade + (mínimo se for acerto) */}
            <div className={cn('grid gap-3', operacao === 'ajuste' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
              <label className="block text-xs font-medium text-muted-foreground">
                {operacao === 'ajuste' ? m.estoque.modal_novo_estoque : m.estoque.modal_quantidade}
                <span className="ml-0.5 text-[color:var(--accent)]">*</span>
                <input
                  ref={firstFieldRef}
                  inputMode="decimal"
                  value={quantidade}
                  onChange={(e) => {
                    setQuantidade(e.target.value)
                    if (erros.quantidade) setErros((x) => ({ ...x, quantidade: null }))
                  }}
                  disabled={saving}
                  required
                  placeholder="0"
                  aria-invalid={!!erros.quantidade}
                  aria-describedby={erros.quantidade ? 'err-qty' : 'hint-qty'}
                  className={cn(`${finIn} mt-1 font-mono tabular-nums`, erros.quantidade && 'border-red-400/60')}
                />
                {erros.quantidade ? (
                  <span id="err-qty" className="mt-1 block text-xs text-red-300">{erros.quantidade}</span>
                ) : (
                  <span id="hint-qty" className="mt-1 block text-[11px] text-muted-foreground">
                    {m.estoque.modal_hint_unidade.replace('{unidade}', unidade)}
                  </span>
                )}
              </label>

              {operacao === 'ajuste' && (
                <label className="block text-xs font-medium text-muted-foreground">
                  {m.estoque.modal_novo_minimo}
                  <input
                    inputMode="decimal"
                    value={novoMinimo}
                    onChange={(e) => {
                      setNovoMinimo(e.target.value)
                      if (erros.minimo) setErros((x) => ({ ...x, minimo: null }))
                    }}
                    disabled={saving}
                    aria-invalid={!!erros.minimo}
                    className={cn(`${finIn} mt-1 font-mono tabular-nums`, erros.minimo && 'border-red-400/60')}
                  />
                  {erros.minimo && <span className="mt-1 block text-xs text-red-300">{erros.minimo}</span>}
                </label>
              )}
            </div>

            {/* Preview do resultado */}
            {quantidade.trim() && qtyNum >= 0 && (
              <div
                aria-live="polite"
                className="grid grid-cols-3 items-center gap-3 rounded-lg border border-dashed app-border bg-slate-950/40 px-4 py-3"
              >
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {m.estoque.preview_antes}
                  </div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-foreground">
                    {fmtQuantidadeEstoque(quantidadeAtual)}
                  </div>
                </div>
                <div className="text-center text-2xl text-muted-foreground" aria-hidden>→</div>
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {m.estoque.preview_depois}
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-lg font-bold tabular-nums',
                      ficaraCritico ? 'text-red-300' : 'text-[color:var(--accent)]',
                    )}
                  >
                    {fmtQuantidadeEstoque(novoEstoque)}
                  </div>
                  {ficaraCritico && (
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300">
                      {m.estoque.badge_critico}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Motivo */}
            <label className="block text-xs font-medium text-muted-foreground">
              {m.estoque.modal_motivo}
              <span className="ml-0.5 text-[color:var(--accent)]">*</span>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={saving}
                className="app-select mt-1 h-10 w-full rounded-md px-3 text-sm"
              >
                {motivosDoTipo.map((mo) => (
                  <option key={mo.value} value={mo.value}>
                    {mo.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Observação */}
            <label className="block text-xs font-medium text-muted-foreground">
              {m.estoque.modal_observacao}
              {motivo === 'OUTRO' && <span className="ml-0.5 text-[color:var(--accent)]">*</span>}
              <input
                value={observacao}
                onChange={(e) => {
                  setObservacao(e.target.value)
                  if (erros.observacao) setErros((x) => ({ ...x, observacao: null }))
                }}
                disabled={saving}
                maxLength={500}
                placeholder={m.estoque.modal_observacao_placeholder}
                aria-invalid={!!erros.observacao}
                aria-describedby={erros.observacao ? 'err-obs' : undefined}
                className={cn(`${finIn} mt-1`, erros.observacao && 'border-red-400/60')}
              />
              {erros.observacao && (
                <span id="err-obs" className="mt-1 block text-xs text-red-300">{erros.observacao}</span>
              )}
            </label>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-border px-5 py-3 sm:px-6">
            <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={saving}>
              {m.comum.cancelar}
            </Button>
            <Button
              type="submit"
              className={operacao === 'saida' ? 'app-btn-danger' : 'app-btn-accent'}
              disabled={saving || !quantidade.trim()}
            >
              {saving
                ? m.comum.carregando ?? '…'
                : operacao === 'entrada'
                  ? m.estoque.modal_confirmar_entrada
                  : operacao === 'saida'
                    ? m.estoque.modal_confirmar_saida
                    : m.estoque.modal_confirmar_acerto}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
