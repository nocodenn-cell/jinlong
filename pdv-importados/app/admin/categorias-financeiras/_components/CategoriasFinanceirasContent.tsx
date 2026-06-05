'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Check, X } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import type { CategoriaFinanceiraRow } from '@/app/gerente/categorias-financeiras/categoriasFinanceirasTypes'
import {
  criarCategoriaFinanceira,
  atualizarCategoriaFinanceira,
  alternarAtivoCategoriaFinanceira,
} from '@/app/gerente/categorias-financeiras/actions'

type Props = {
  dados: { rows: CategoriaFinanceiraRow[]; total: number }
}

export function CategoriasFinanceirasContent({ dados }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState(dados.rows)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNome, setEditingNome] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!newNome.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await criarCategoriaFinanceira({ nome: newNome })
      if (!res.success) {
        setError(res.error)
        return
      }
      setNewNome('')
      setCreatingNew(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!editingNome.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await atualizarCategoriaFinanceira({ id, nome: editingNome })
      if (!res.success) {
        setError(res.error)
        return
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, nome: editingNome } : r))
      )
      setEditingId(null)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAtivo = async (id: string, ativoAtual: boolean) => {
    setError(null)
    try {
      const res = await alternarAtivoCategoriaFinanceira(id, !ativoAtual)
      if (!res.success) {
        setError(res.error)
        return
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  const columns: Column<CategoriaFinanceiraRow>[] = [
    {
      key: 'nome',
      header: 'Nome',
      sortValue: (r) => r.nome,
      cell: (r) => (
        <span className="font-medium text-zinc-200">{r.nome}</span>
      ),
    },
    {
      key: 'ativo',
      header: 'Status',
      cell: (r) => (
        <span
          className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium"
          style={{
            background: r.ativo ? 'var(--fp-success-bg)' : 'rgba(255,0,0,0.1)',
            color: r.ativo ? 'var(--fp-success)' : '#ef4444',
          }}
        >
          {r.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleToggleAtivo(r.id, r.ativo)}
            className="rounded px-2 py-1 text-[12px] transition-colors hover:bg-zinc-800"
          >
            {r.ativo ? '✓' : '○'}
          </button>
          <button
            onClick={() => {
              setEditingId(r.id)
              setEditingNome(r.nome)
            }}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Edit2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col">
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

      {creatingNew && (
        <div className="border-b border-zinc-800 px-6 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              placeholder="Nome da categoria..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-yellow-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreatingNew(false)
              }}
            />
            <button
              onClick={handleCreate}
              disabled={loading || !newNome.trim()}
              className="rounded-lg bg-yellow-500 px-3 py-2 text-[12px] font-medium text-zinc-950 transition-colors disabled:opacity-50 hover:bg-yellow-400"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => setCreatingNew(false)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-[12px] transition-colors hover:bg-zinc-800"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {editingId && (
        <div className="border-b border-zinc-800 px-6 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={editingNome}
              onChange={(e) => setEditingNome(e.target.value)}
              placeholder="Nome da categoria..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px] text-zinc-100 focus:border-yellow-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdate(editingId)
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
            <button
              onClick={() => handleUpdate(editingId)}
              disabled={loading || !editingNome.trim()}
              className="rounded-lg bg-yellow-500 px-3 py-2 text-[12px] font-medium text-zinc-950 transition-colors disabled:opacity-50 hover:bg-yellow-400"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-[12px] transition-colors hover:bg-zinc-800"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <span className="text-[13px] font-medium text-zinc-300">
          Categorias ({dados.total})
        </span>
        <button
          onClick={() => setCreatingNew(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-3 py-2 text-[12px] font-medium text-zinc-950 transition-colors hover:bg-yellow-400"
        >
          <Plus size={14} />
          Nova
        </button>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-3xl text-zinc-700" aria-hidden>
              💰
            </span>
            <p className="text-[12px] text-zinc-500">Nenhuma categoria encontrada</p>
          </div>
        }
        className="rounded-none border-x-0"
      />

      {dados.total > 50 && (
        <div className="border-t border-zinc-800 px-6 py-3 text-center text-[11px] text-zinc-500">
          Página 1 de {Math.ceil(dados.total / 50)} · {dados.total} categorias
        </div>
      )}
    </div>
  )
}
