'use client'

import { useEffect, useRef, useState } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import { obterDetalhamentoItens, type DetalheComissaoItem } from './actions'

type Props = {
  m: Mensagens
  vendedorId: string
  vendedorNome: string
  dataInicio: string
  dataFim: string
  open: boolean
  onClose: () => void
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 animate-pulse rounded bg-current opacity-10" />
        </td>
      ))}
    </tr>
  )
}

function fmtBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    /* invalid date */
    return iso
  }
}

function escapeCsvField(value: string): string {
  if (/[",\n\r;]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function buildCsv(items: DetalheComissaoItem[]): string {
  const header = ['Venda ID', 'Produto', 'Quantidade', 'Comissão Unit.', 'Comissão Total', 'Data'].join(';')
  const lines = items.map((item) =>
    [
      escapeCsvField(item.vendaId),
      escapeCsvField(item.produtoNome),
      String(item.quantidade),
      String(item.valorComissaoUnitario),
      String(item.valorComissaoTotal),
      escapeCsvField(fmtDate(item.criadoEm)),
    ].join(';'),
  )
  return [header, ...lines].join('\r\n')
}

export function AuditoriaModal({ m, vendedorId, vendedorNome, dataInicio, dataFim, open, onClose }: Props) {
  const [items, setItems] = useState<DetalheComissaoItem[]>([])
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      fetchedRef.current = false
      setItems([])
      return
    }
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    obterDetalhamentoItens(vendedorId, dataInicio, dataFim)
      .then((data) => setItems(data))
      .catch(() => { setItems([]) })
      .finally(() => setLoading(false))
  }, [open, vendedorId, dataInicio, dataFim])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const [csvHref, setCsvHref] = useState<string | null>(null)

  function handleExportCsv() {
    const csv = buildCsv(items)
    const dataUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
    setCsvHref(dataUri)
    setTimeout(() => setCsvHref(null), 3000)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 backdrop-blur-sm sm:items-start"
      role="dialog"
      aria-modal="true"
      aria-label={m.comissoes.auditoria}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="
          relative flex h-full w-full max-w-2xl flex-col overflow-hidden
          bg-white shadow-2xl transition-transform duration-300
          dark:bg-neutral-900
          sm:h-screen sm:translate-x-0
        "
        style={{ transform: 'translateX(0)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-4 dark:border-neutral-700">
          <div>
            <h2 className="text-base font-semibold">{m.comissoes.auditoria}</h2>
            <p className="text-sm opacity-60">{vendedorNome} · {dataInicio} → {dataFim}</p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && items.length > 0 && (
              csvHref ? (
                <a
                  href={csvHref}
                  download={`comissoes-${vendedorId}-${dataInicio}-${dataFim}.csv`}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors app-btn-neutral"
                >
                  {m.comissoes.exportar_csv}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors app-btn-neutral"
                >
                  {m.comissoes.exportar_csv}
                </button>
              )
            )}
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors app-btn-neutral"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="overflow-x-auto rounded-xl shadow">
            <table className="w-full text-sm">
              <thead>
                <tr className="gerente-fin-header">
                  <th className="px-3 py-2 text-left font-semibold">Produto</th>
                  <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                  <th className="px-3 py-2 text-right font-semibold">Comissão Unit.</th>
                  <th className="px-3 py-2 text-right font-semibold">{m.comissoes.total_comissao}</th>
                  <th className="px-3 py-2 text-left font-semibold">Data</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="gerente-fin-empty px-4 py-8 text-center">
                      {m.comissoes.sem_dados}
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={`${item.vendaId}-${idx}`} className="gerente-fin-row-hover transition-colors">
                      <td className="gerente-fin-cell px-3 py-3">{item.produtoNome}</td>
                      <td className="gerente-fin-cell px-3 py-3 text-right tabular-nums">{item.quantidade}</td>
                      <td className="gerente-fin-cell px-3 py-3 text-right font-mono tabular-nums">
                        {fmtBRL(item.valorComissaoUnitario)}
                      </td>
                      <td className="gerente-fin-cell px-3 py-3 text-right font-mono tabular-nums font-semibold">
                        {fmtBRL(item.valorComissaoTotal)}
                      </td>
                      <td className="gerente-fin-cell px-3 py-3 whitespace-nowrap text-xs tabular-nums">
                        {fmtDate(item.criadoEm)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
