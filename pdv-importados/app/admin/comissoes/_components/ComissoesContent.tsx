'use client'

/**
 * FastProduct Admin — ComissoesContent (Fase 8)
 *
 * Client component com tabela de resumo de comissões + sheet detalhe.
 * Reutiliza actions de /gerente/comissoes (resumo, detalhe, marcar pago).
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import type { ComissaoResumoRow, ComissaoDetalheRow, FiltroComissoes } from '@/app/gerente/comissoes/actions'
import {
  carregarDetalheComissoes,
  marcarComissoesPagas,
} from '@/app/gerente/comissoes/actions'

type Props = {
  dados: ComissaoResumoRow[]
  filtroInicial: FiltroComissoes
}

export function ComissoesContent({ dados, filtroInicial }: Props) {
  const router = useRouter()
  const [rows] = useState(dados)
  const [detalheOperador, setDetalheOperador] = useState<ComissaoResumoRow | null>(null)
  const [detalheRows, setDetalheRows] = useState<ComissaoDetalheRow[]>([])
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const abrirDetalhe = useCallback(async (row: ComissaoResumoRow) => {
    setDetalheOperador(row)
    setDetalheLoading(true)
    setSelecionados(new Set())
    setError(null)

    try {
      const res = await carregarDetalheComissoes(row.operador_id, filtroInicial)
      if (!res.success) {
        setError(res.error)
        return
      }
      setDetalheRows(res.data)
    } finally {
      setDetalheLoading(false)
    }
  }, [filtroInicial])

  const marcarPagas = async () => {
    if (!detalheOperador || selecionados.size === 0) return
    setError(null)

    try {
      const res = await marcarComissoesPagas({
        operador_id: detalheOperador.operador_id,
        ids: Array.from(selecionados),
      })
      if (!res.success) {
        setError(res.error)
        return
      }

      setSelecionados(new Set())
      await abrirDetalhe(detalheOperador)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao marcar como pago')
    }
  }

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTodos = () => {
    const pendentes = detalheRows
      .filter((r) => r.status === 'pendente')
      .map((r) => r.comissao_id)
    setSelecionados((prev) =>
      prev.size === pendentes.length ? new Set() : new Set(pendentes)
    )
  }

  const totalPendente = detalheRows
    .filter((r) => r.status === 'pendente' && selecionados.has(r.comissao_id))
    .reduce((s, r) => s + r.valor_comissao, 0)

  const columns: Column<ComissaoResumoRow>[] = [
    {
      key: 'operador',
      header: 'Operador',
      sortValue: (r) => r.operador_nome,
      cell: (r) => (
        <button
          onClick={() => abrirDetalhe(r)}
          className="font-medium text-yellow-500 transition-colors hover:text-yellow-400"
        >
          {r.operador_nome}
        </button>
      ),
    },
    {
      key: 'vendas',
      header: 'Vendas',
      align: 'right',
      sortValue: (r) => r.total_vendas,
      cell: (r) => <span className="text-[12px] text-zinc-400">{r.total_vendas}</span>,
    },
    {
      key: 'comissao_total',
      header: 'Comissão Total',
      align: 'right',
      sortValue: (r) => r.total_comissao,
      cell: (r) => (
        <span className="text-[12px] font-medium text-zinc-200">
          {formatBRL(r.total_comissao)}
        </span>
      ),
    },
    {
      key: 'comissao_pago',
      header: 'Pago',
      align: 'right',
      sortValue: (r) => r.total_pago,
      cell: (r) => (
        <span className="text-[12px] text-green-400">{formatBRL(r.total_pago)}</span>
      ),
    },
    {
      key: 'comissao_pendente',
      header: 'Pendente',
      align: 'right',
      sortValue: (r) => r.total_pendente,
      cell: (r) => (
        <span className="text-[12px] text-amber-400">{formatBRL(r.total_pendente)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col">
      {/* Erro */}
      {error && (
        <div
          className="mx-6 mt-3 rounded-lg px-3 py-2 text-[12px]"
          style={{
            background: 'var(--fp-danger-bg)',
            border: '1px solid var(--fp-danger-border)',
            color: 'var(--fp-danger)',
          }}
        >
          {error}
        </div>
      )}

      {/* Filtros (básico) */}
      <div className="border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center justify-between text-[12px] text-zinc-400">
          <span>
            Período: {filtroInicial.de} a {filtroInicial.ate}
          </span>
          <span>Status: {filtroInicial.status}</span>
        </div>
      </div>

      {/* Cabeçalho com contador */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <span className="text-[13px] font-medium text-zinc-300">
          Operadores ({rows.length})
        </span>
      </div>

      {/* Tabela de resumo */}
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.operador_id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-3xl text-zinc-700" aria-hidden>
              💼
            </span>
            <p className="text-[12px] text-zinc-500">
              Nenhuma comissão encontrada neste período
            </p>
          </div>
        }
        className="rounded-none border-x-0 border-b border-zinc-800"
      />

      {/* Sheet de detalhe */}
      {detalheOperador && (
        <div className="flex flex-col border-t border-zinc-800">
          {/* Header do sheet */}
          <div className="border-b border-zinc-800 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-zinc-100">
                  {detalheOperador.operador_nome}
                </h2>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {formatBRL(detalheOperador.total_pendente)} em pendência
                </p>
              </div>
              <button
                onClick={() => setDetalheOperador(null)}
                className="text-zinc-400 transition-colors hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 border-b border-zinc-800 px-6 py-3">
            <div
              className="rounded-lg p-2"
              style={{ background: 'var(--fp-bg-secondary)', border: '1px solid var(--fp-border)' }}
            >
              <p className="text-[10px] uppercase text-zinc-500">Total</p>
              <p className="mt-1 text-[13px] font-semibold text-zinc-100">
                {formatBRL(detalheOperador.total_comissao)}
              </p>
            </div>
            <div
              className="rounded-lg p-2"
              style={{ background: 'var(--fp-bg-secondary)', border: '1px solid var(--fp-border)' }}
            >
              <p className="text-[10px] uppercase text-zinc-500">Pago</p>
              <p className="mt-1 text-[13px] font-semibold text-green-400">
                {formatBRL(detalheOperador.total_pago)}
              </p>
            </div>
            <div
              className="rounded-lg p-2"
              style={{ background: 'var(--fp-bg-secondary)', border: '1px solid var(--fp-border)' }}
            >
              <p className="text-[10px] uppercase text-zinc-500">Pendente</p>
              <p className="mt-1 text-[13px] font-semibold text-amber-400">
                {formatBRL(detalheOperador.total_pendente)}
              </p>
            </div>
          </div>

          {/* Ações */}
          {detalheLoading ? (
            <div className="border-b border-zinc-800 px-6 py-3 text-center text-[12px] text-zinc-500">
              Carregando detalhe...
            </div>
          ) : detalheRows.length > 0 ? (
            <>
              <div className="border-b border-zinc-800 px-6 py-3">
                <button
                  onClick={toggleTodos}
                  className="text-[12px] text-yellow-500 transition-colors hover:text-yellow-400"
                >
                  {selecionados.size === detalheRows.filter((r) => r.status === 'pendente').length
                    ? 'Desselecionar todas'
                    : 'Selecionar pendentes'}
                </button>
                {selecionados.size > 0 && (
                  <button
                    onClick={marcarPagas}
                    className="ml-auto inline-block rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-green-500"
                  >
                    Marcar {selecionados.size} como pago ({formatBRL(totalPendente)})
                  </button>
                )}
              </div>

              {/* Lista detalhe */}
              <div className="max-h-[300px] overflow-y-auto">
                {detalheRows.map((row) => {
                  const isPendente = row.status === 'pendente'
                  return (
                    <div
                      key={row.comissao_id}
                      className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3 hover:bg-zinc-900"
                    >
                      {isPendente && (
                        <input
                          type="checkbox"
                          checked={selecionados.has(row.comissao_id)}
                          onChange={() => toggleSelecionado(row.comissao_id)}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 accent-yellow-500"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-zinc-200">
                          Venda: {row.venda_id.slice(0, 8)}...
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {new Date(row.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] font-medium text-zinc-200">
                          {formatBRL(row.valor_comissao)}
                        </p>
                        <p
                          className="text-[11px]"
                          style={{
                            color: isPendente ? '#facc15' : '#22c55e',
                          }}
                        >
                          {isPendente ? 'Pendente' : 'Pago'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="border-b border-zinc-800 px-6 py-4 text-center text-[12px] text-zinc-500">
              Sem comissões neste período
            </div>
          )}
        </div>
      )}
    </div>
  )
}
