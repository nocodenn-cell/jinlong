'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import { obterResumoComissoes, marcarComissoesPagas, type ResumoComissaoRow } from './actions'
import { AuditoriaModal } from './AuditoriaModal'

type Props = { m: Mensagens }

function toDateStr(y: number, mo: number): string {
  return `${y}-${String(mo).padStart(2, '0')}-01`
}

function toDateStrEnd(y: number, mo: number): string {
  const last = new Date(y, mo, 0).getDate()
  return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
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

type AuditoriaState = {
  vendedorId: string
  vendedorNome: string
  dataInicio: string
  dataFim: string
} | null

export function ComissoesPageClient({ m }: Props) {
  const now = new Date()
  const [ano, setAno] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<ResumoComissaoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [auditoria, setAuditoria] = useState<AuditoriaState>(null)
  const [pagandoId, setPagandoId] = useState<string | null>(null)

  const dataInicio = toDateStr(ano, mes)
  const dataFim = toDateStrEnd(ano, mes)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await obterResumoComissoes(dataInicio, dataFim)
      setRows(result)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const meses = Array.from({ length: 12 }, (_, i) => i + 1)
  const anos = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{m.comissoes.titulo}</h1>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="rounded-lg px-3 py-2 text-sm shadow-inner app-input"
            aria-label="Mês"
          >
            {meses.map((mo) => (
              <option key={mo} value={mo}>
                {String(mo).padStart(2, '0')}
              </option>
            ))}
          </select>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="rounded-lg px-3 py-2 text-sm shadow-inner app-input"
            aria-label="Ano"
          >
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={() => { void fetchData() }}
            className="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors app-btn-neutral"
          >
            {m.comissoes.filtrar}
          </button>
        </div>
      </div>

      <p className="mb-3 text-sm opacity-60">{m.comissoes.resumo}</p>

      <div className="overflow-x-auto rounded-xl shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="gerente-fin-header">
              <th className="px-3 py-2 text-left font-semibold">Vendedor</th>
              <th className="px-3 py-2 text-right font-semibold">{m.comissoes.total_vendas}</th>
              <th className="px-3 py-2 text-right font-semibold">{m.comissoes.total_comissao}</th>
              <th className="px-3 py-2 text-right font-semibold">{m.comissoes.quantidade_itens}</th>
              <th className="px-3 py-2 text-right font-semibold">Vendas</th>
              <th className="px-3 py-2 text-center font-semibold">{m.gerente.col_acoes}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="gerente-fin-empty px-4 py-8 text-center">
                  {m.comissoes.sem_dados}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.vendedorId} className="gerente-fin-row-hover transition-colors">
                  <td className="gerente-fin-cell px-3 py-3">{row.vendedorNome}</td>
                  <td className="gerente-fin-cell px-3 py-3 text-right font-mono tabular-nums">
                    {fmtBRL(row.totalVendasValor)}
                  </td>
                  <td className="gerente-fin-cell px-3 py-3 text-right font-mono tabular-nums font-semibold">
                    {fmtBRL(row.totalComissao)}
                  </td>
                  <td className="gerente-fin-cell px-3 py-3 text-right tabular-nums">
                    {row.quantidadeItens}
                  </td>
                  <td className="gerente-fin-cell px-3 py-3 text-right tabular-nums">
                    {row.quantidadeVendas}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() =>
                          setAuditoria({
                            vendedorId: row.vendedorId,
                            vendedorNome: row.vendedorNome,
                            dataInicio,
                            dataFim,
                          })
                        }
                        className="gerente-section-accent text-sm font-medium hover:underline"
                      >
                        {m.comissoes.auditoria}
                      </button>
                      <button
                        disabled={pagandoId === row.vendedorId || row.totalComissao === 0}
                        onClick={async () => {
                          if (!confirm(`Marcar comissões de ${row.vendedorNome} (${fmtBRL(row.totalComissao)}) como pagas?`)) return
                          setPagandoId(row.vendedorId)
                          try {
                            await marcarComissoesPagas(row.vendedorId, dataInicio, dataFim)
                            void fetchData()
                          } finally {
                            setPagandoId(null)
                          }
                        }}
                        className="rounded-md px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 app-btn-success"
                      >
                        {pagandoId === row.vendedorId ? '…' : m.comissoes.marcar_pago}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {auditoria && (
        <AuditoriaModal
          m={m}
          vendedorId={auditoria.vendedorId}
          vendedorNome={auditoria.vendedorNome}
          dataInicio={auditoria.dataInicio}
          dataFim={auditoria.dataFim}
          open={true}
          onClose={() => setAuditoria(null)}
        />
      )}
    </>
  )
}
