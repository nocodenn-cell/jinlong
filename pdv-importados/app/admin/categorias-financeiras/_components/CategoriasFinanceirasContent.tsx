'use client'

import { useState, useEffect } from 'react'
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
  const [newTipo, setNewTipo] = useState<'RECEITA'|'DESPESA'|'AMBOS'>('DESPESA')
  const [editingTipo, setEditingTipo] = useState<'RECEITA'|'DESPESA'|'AMBOS'>('DESPESA')
  useEffect(() => setRows(dados.rows), [dados.rows])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!newNome.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await criarCategoriaFinanceira({ nome: newNome, tipo: newTipo })
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
      const res = await atualizarCategoriaFinanceira({ id, nome: editingNome, tipo: editingTipo })
      if (!res.success) {
        setError(res.error)
        return
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, nome: editingNome, tipo: editingTipo } : r))
      )
      setEditingId(null)
      router.refresh()
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
      router.refresh()
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
      key: 'tipo',
      header: 'Tipo',
      cell: r => <span>{r.tipo}</span>,
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
            aria-label={r.ativo ? `Desativar ${r.nome}` : `Ativar ${r.nome}`}
            onClick={() => handleToggleAtivo(r.id, r.ativo)}
            className="rounded px-2 py-1 text-[12px] text-jl-fg-2 transition-colors hover:bg-white/[0.04]"
          >
            {r.ativo ? 'Desativar' : 'Ativar'}
          </button>
          <button
            aria-label={`Editar ${r.nome}`}
            onClick={() => {
              setEditingId(r.id)
              setEditingNome(r.nome)
              setEditingTipo(r.tipo)
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
        <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newNome}
              aria-label="Nome da nova categoria"
              onChange={(e) => setNewNome(e.target.value)}
              placeholder="Nome da categoria..."
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreatingNew(false)
              }}
            />
            <label className="grid gap-1 text-small">Tipo<select className="fp-control" value={newTipo} onChange={e => setNewTipo(e.target.value as typeof newTipo)}><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option><option value="AMBOS">Ambos</option></select></label>
            <button
              onClick={handleCreate}
              aria-label="Salvar nova categoria"
              disabled={loading || !newNome.trim()}
              className="admin-v2-btn-primary disabled:opacity-50"
            >
              <Check size={14} />
            </button>
            <button
              aria-label="Cancelar nova categoria"
              onClick={() => setCreatingNew(false)}
              className="admin-v2-btn-secondary"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {editingId && (
        <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={editingNome}
              aria-label="Nome da categoria"
              onChange={(e) => setEditingNome(e.target.value)}
              placeholder="Nome da categoria..."
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdate(editingId)
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
            <label className="grid gap-1 text-small">Tipo<select className="fp-control" value={editingTipo} onChange={e => setEditingTipo(e.target.value as typeof editingTipo)}><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option><option value="AMBOS">Ambos</option></select></label>
            <button
              onClick={() => handleUpdate(editingId)}
              aria-label="Salvar edição da categoria"
              disabled={loading || !editingNome.trim()}
              className="admin-v2-btn-primary disabled:opacity-50"
            >
              <Check size={14} />
            </button>
            <button
              aria-label="Cancelar edição"
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
            <p className="text-[13px] font-medium text-jl-fg-2">Nenhuma categoria encontrada</p>
            <p className="text-[11px] text-jl-fg-3">Use o campo acima para cadastrar a primeira categoria.</p>
          </div>
        }
        className="rounded-none border-x-0 border-[var(--color-border-secondary)]"
      />

      {dados.total > 50 && (
        <div className="mt-4 border-t border-[var(--color-border-secondary)] pt-3 text-center text-[11px] text-jl-fg-3">
          Página 1 de {Math.ceil(dados.total / 50)} · {dados.total} categorias
        </div>
      )}
    </SectionCard>
  )
}
