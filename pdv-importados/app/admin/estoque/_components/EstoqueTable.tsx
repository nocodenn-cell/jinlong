'use client'

/**
 * FastProduct Admin — EstoqueTable (Fase 5)
 *
 * Tabela de saldos do catálogo. Usa o DataTable genérico (Fase 2). A PAGINAÇÃO é
 * server-side (?page= na URL, resolvida no page.tsx) — esta tabela só renderiza
 * a página atual; o sort dos headers ordena a página corrente (client-side).
 *
 * Mantém o estado dos overlays (AjusteSaldoModal + KardexSheet) e os dispara
 * pelas ações de linha (visíveis no hover, via DataTable).
 *
 * Sem query nova: a listagem vem de `obterListaEstoqueGerente` (no server) e o
 * ajuste reusa `atualizarEstoqueProduto`. Só o kardex tem action própria.
 */

import { useState } from 'react'
import { History, SlidersHorizontal } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { OriginBadge, type Origin } from '@/components/ui/badges'
import { AjusteSaldoModal, type AjusteAlvo } from './AjusteSaldoModal'
import { KardexSheet, type KardexAlvo } from './KardexSheet'

export type EstoqueLinha = {
  id: string
  nome: string
  codigo_barras: string | null
  unidade_medida: string
  origem: string
  quantidade_atual: number | null
  estoque_minimo: number | null
  deficit: number | null
}

const ORIGEM_MAP: Record<string, { origin: Origin; label: string }> = {
  china_manual: { origin: 'IMPORTADO', label: 'China' },
  brasil_nf: { origin: 'NFE', label: 'Brasil · NF' },
  brasil_sem_nf: { origin: 'NACIONAL', label: 'Brasil' },
}

type Severity = 'zero' | 'low' | 'ok'

function severidadeSaldo(atual: number | null, minimo: number | null): Severity {
  if (atual === null) return 'ok'
  if (atual <= 0) return 'zero'
  if (minimo != null && atual <= minimo) return 'low'
  return 'ok'
}

const SEV_CLASS: Record<Severity, string> = {
  zero: 'font-semibold text-red-400',
  low: 'font-semibold text-amber-400',
  ok: 'text-green-400',
}

function ActionBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </button>
  )
}

function EstoqueEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="text-4xl text-zinc-700" aria-hidden>
        📦
      </span>
      <p className="text-[14px] font-medium text-zinc-400">Nenhum produto encontrado</p>
      <p className="text-[12px] text-zinc-600">Tente ajustar os filtros de busca, origem ou visão.</p>
    </div>
  )
}

export function EstoqueTable({ linhas }: { linhas: EstoqueLinha[] }) {
  const [ajusteAlvo, setAjusteAlvo] = useState<AjusteAlvo | null>(null)
  const [kardexAlvo, setKardexAlvo] = useState<KardexAlvo | null>(null)

  const columns: Column<EstoqueLinha>[] = [
    {
      key: 'produto',
      header: 'Produto',
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-[12px] font-medium text-zinc-200">{r.nome}</p>
          <p className="font-mono text-[10px] text-zinc-600">{r.codigo_barras ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      sortValue: (r) => r.quantidade_atual ?? Number.NEGATIVE_INFINITY,
      cell: (r) => {
        if (r.quantidade_atual === null) return <span className="text-zinc-700">—</span>
        const sev = severidadeSaldo(r.quantidade_atual, r.estoque_minimo)
        return <span className={SEV_CLASS[sev]}>{r.quantidade_atual}</span>
      },
    },
    {
      key: 'minimo',
      header: 'Mínimo',
      align: 'right',
      sortValue: (r) => r.estoque_minimo ?? Number.NEGATIVE_INFINITY,
      cell: (r) =>
        r.estoque_minimo === null ? (
          <span className="text-zinc-700">—</span>
        ) : (
          <span className="text-zinc-400">{r.estoque_minimo}</span>
        ),
    },
    {
      key: 'deficit',
      header: 'Déficit',
      align: 'right',
      sortValue: (r) => r.deficit ?? 0,
      cell: (r) =>
        r.deficit != null && r.deficit > 0 ? (
          <span className="font-medium text-amber-400">-{r.deficit}</span>
        ) : (
          <span className="text-zinc-700">—</span>
        ),
    },
    {
      key: 'unidade',
      header: 'Un.',
      align: 'center',
      cell: (r) => <span className="text-[11px] uppercase text-zinc-500">{r.unidade_medida}</span>,
    },
    {
      key: 'origem',
      header: 'Origem',
      cell: (r) => {
        const m = ORIGEM_MAP[r.origem]
        return m ? (
          <OriginBadge origin={m.origin} label={m.label} />
        ) : (
          <span className="text-zinc-700">—</span>
        )
      },
    },
  ]

  return (
    <>
      <DataTable
        data={linhas}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={<EstoqueEmpty />}
        className="rounded-none border-x-0"
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <ActionBtn
              label={`Ajustar saldo de ${row.nome}`}
              onClick={() =>
                setAjusteAlvo({
                  produtoId: row.id,
                  produtoNome: row.nome,
                  quantidadeAtual: row.quantidade_atual ?? 0,
                  estoqueMinimo: row.estoque_minimo ?? 0,
                })
              }
            >
              <SlidersHorizontal size={13} aria-hidden />
            </ActionBtn>
            <ActionBtn
              label={`Ver kardex de ${row.nome}`}
              onClick={() => setKardexAlvo({ produtoId: row.id, produtoNome: row.nome })}
            >
              <History size={13} aria-hidden />
            </ActionBtn>
          </div>
        )}
      />

      <AjusteSaldoModal alvo={ajusteAlvo} onClose={() => setAjusteAlvo(null)} />
      <KardexSheet alvo={kardexAlvo} onClose={() => setKardexAlvo(null)} />
    </>
  )
}
