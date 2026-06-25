'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Check, X } from 'lucide-react'
import { SectionCard } from '@/components/ui/admin-v2'
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
        <span className="font-medium text-jl-fg-1">{r.nome}</span>
      ),
    },
    {
      key: 'ativo',
      header: 'Status',
      cell: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium ${
            r.ativo ? 'admin-v2-badge-success' : 'admin-v2-badge-danger'
          }`}
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
            className="rounded px-2 py-1 text-[12px] text-jl-fg-2 transition-colors hover:bg-white/[0.04]"
          >
            {r.ativo ? '✓' : '○'}
          </button>
          <button
            onClick={() => {
              setEditingId(r.id)
              setEditingNome(r.nome)
            }}
            className="rounded p-1 text-jl-fg-3 transition-colors hover:bg-white/[0.04] hover:text-jl-fg-1"
          >
            <Edit2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <SectionCard
      title={`Categorias (${dados.total})`}
      action={
        <button
          onClick={() => setCreatingNew(true)}
          className="admin-v2-btn-primary"
        >
          <Plus size={14} />
          Nova
        </button>
      }
    >
      {error && (
        <div className="admin-v2-alert-danger mb-4 rounded-lg px-3 py-2 text-[12px]">
          {error}
        </div>
      )}

      {creatingNew && (
        <div className="mb-4 border-b border-slate-100 pb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              placeholder="Nome da categoria..."
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreatingNew(false)
              }}
            />
            <button
              onClick={handleCreate}
              disabled={loading || !newNome.trim()}
              className="admin-v2-btn-primary disabled:opacity-50"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => setCreatingNew(false)}
              className="admin-v2-btn-secondary"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {editingId && (
        <div className="mb-4 border-b border-slate-100 pb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={editingNome}
              onChange={(e) => setEditingNome(e.target.value)}
              placeholder="Nome da categoria..."
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdate(editingId)
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
            <button
              onClick={() => handleUpdate(editingId)}
              disabled={loading || !editingNome.trim()}
              className="admin-v2-btn-primary disabled:opacity-50"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="admin-v2-btn-secondary"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-3xl text-jl-fg-3" aria-hidden>
              💰
            </span>
            <p className="text-[12px] text-jl-fg-3">Nenhuma categoria encontrada</p>
          </div>
        }
        className="rounded-none border-x-0 border-slate-100"
      />

      {dados.total > 50 && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-center text-[11px] text-jl-fg-3">
          Página 1 de {Math.ceil(dados.total / 50)} · {dados.total} categorias
        </div>
      )}
    </SectionCard>
  )
}
