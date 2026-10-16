'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Check, X } from 'lucide-react'
import { SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/feedback'
import type { CategoriaFinanceiraRow } from '@/app/gerente/categorias-financeiras/categoriasFinanceirasTypes'
import {
  criarCategoriaFinanceira,
  atualizarCategoriaFinanceira,
  alternarAtivoCategoriaFinanceira,
} from '@/app/gerente/categorias-financeiras/actions'
import { getMessages } from '@/i18n/getMessages'
import { fmtTemplate } from '@/i18n/fmtTemplate'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = {
  idioma: Idioma
  dados: { rows: CategoriaFinanceiraRow[]; total: number }
}

const PAGE_SIZE = 50

export function CategoriasFinanceirasContent({ idioma, dados }: Props) {
  const m = getMessages(idioma).categorias_financeiras
  const tipoLabel: Record<CategoriaFinanceiraRow['tipo'], string> = {
    RECEITA: m.tipo_receita,
    DESPESA: m.tipo_despesa,
    AMBOS: m.tipo_ambos,
  }
  const tipoOptions = (
    <>
      <option value="DESPESA">{m.tipo_despesa}</option>
      <option value="RECEITA">{m.tipo_receita}</option>
      <option value="AMBOS">{m.tipo_ambos}</option>
    </>
  )
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
      header: m.col_nome,
      sortValue: (r) => r.nome,
      cell: (r) => (
        <span className="font-medium text-jl-fg-1">{r.nome}</span>
      ),
    },
    {
      key: 'tipo',
      header: m.col_tipo,
      cell: r => <span>{tipoLabel[r.tipo] ?? r.tipo}</span>,
    },
    {
      key: 'ativo',
      header: m.col_situacao,
      cell: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium ${
            r.ativo ? 'admin-v2-badge-success' : 'admin-v2-badge-danger'
          }`}
        >
          {r.ativo ? m.status_ativa : m.status_inativa}
        </span>
      ),
    },
    {
      key: 'actions',
      header: m.col_acoes,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`${r.ativo ? m.inativar : m.ativar} ${r.nome}`}
            onClick={() => handleToggleAtivo(r.id, r.ativo)}
            className="rounded px-2 py-1 text-[12px] text-jl-fg-2 transition-colors hover:bg-white/[0.04]"
          >
            {r.ativo ? m.inativar : m.ativar}
          </button>
          <button
            type="button"
            aria-label={`${m.editar_categoria} ${r.nome}`}
            title={m.editar_categoria}
            onClick={() => {
              setEditingId(r.id)
              setEditingNome(r.nome)
              setEditingTipo(r.tipo)
            }}
            className="rounded p-1 text-jl-fg-3 transition-colors hover:bg-white/[0.04] hover:text-jl-fg-1"
          >
            <Edit2 size={14} aria-hidden />
          </button>
        </div>
      ),
    },
  ]

  return (
    <SectionCard
      title={`${m.lista_titulo} (${dados.total})`}
      action={
        <button
          type="button"
          onClick={() => setCreatingNew(true)}
          className="admin-v2-btn-primary"
        >
          <Plus size={14} aria-hidden />
          {m.nova_categoria}
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
              aria-label={m.nome_label}
              onChange={(e) => setNewNome(e.target.value)}
              placeholder={m.nome_placeholder}
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreatingNew(false)
              }}
            />
            <label className="grid gap-1 text-small">{m.tipo_label}<select className="fp-control" value={newTipo} onChange={e => setNewTipo(e.target.value as typeof newTipo)}>{tipoOptions}</select></label>
            <button
              type="button"
              onClick={handleCreate}
              aria-label={m.criar}
              title={m.criar}
              disabled={loading || !newNome.trim()}
              className="admin-v2-btn-primary disabled:opacity-50"
            >
              <Check size={14} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={m.cancelar}
              title={m.cancelar}
              onClick={() => setCreatingNew(false)}
              className="admin-v2-btn-secondary"
            >
              <X size={14} aria-hidden />
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
              aria-label={m.nome_label}
              onChange={(e) => setEditingNome(e.target.value)}
              placeholder={m.nome_placeholder}
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdate(editingId)
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
            <label className="grid gap-1 text-small">{m.tipo_label}<select className="fp-control" value={editingTipo} onChange={e => setEditingTipo(e.target.value as typeof editingTipo)}>{tipoOptions}</select></label>
            <button
              type="button"
              onClick={() => handleUpdate(editingId)}
              aria-label={m.salvar}
              title={m.salvar}
              disabled={loading || !editingNome.trim()}
              className="admin-v2-btn-primary disabled:opacity-50"
            >
              <Check size={14} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={m.cancelar}
              title={m.cancelar}
              onClick={() => setEditingId(null)}
              className="admin-v2-btn-secondary"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <EmptyState title={m.sem_categorias} description={m.cadastro_rapido_hint} className="py-12" />
        }
        className="rounded-none border-x-0 border-[var(--color-border-secondary)]"
      />

      {dados.total > PAGE_SIZE && (
        <div className="mt-4 border-t border-[var(--color-border-secondary)] pt-3 text-center text-[11px] text-jl-fg-3">
          {fmtTemplate(m.paginacao_resumo, {
            pagina: 1,
            paginas: Math.ceil(dados.total / PAGE_SIZE),
            total: dados.total,
          })}
        </div>
      )}
    </SectionCard>
  )
}
