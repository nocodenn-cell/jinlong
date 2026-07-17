'use client'

/**
 * FastProduct Admin — CategoriasProdutosContent (Fase 8, revisado na Fase 5)
 *
 * Client component com tabela de categorias (CRUD inline) + busca, filtro de
 * situação e paginação real (URL-driven, mesmo padrão de outras listas do
 * Admin V2). Reutiliza actions de /gerente/categorias-produtos.
 */

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Plus, Edit2, Check, X, Search, Trash2, AlertCircle } from 'lucide-react'
import { SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ConfirmExcluirCadastroModal } from '@/components/gerente/cadastro'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { CategoriaProdutoRow } from '@/app/gerente/categorias-produtos/categoriasProdutosTypes'
import {
  criarCategoriaProduto,
  atualizarCategoriaProduto,
  alternarAtivoCategoriaProduto,
  excluirCategoriaProduto,
} from '@/app/gerente/categorias-produtos/actions'

type SituacaoFiltro = 'todos' | 'ativos' | 'inativos'

type Props = {
  dados: { rows: CategoriaProdutoRow[]; total: number }
  loadError: string | null
  idioma: Idioma
  filtroInicial: { busca: string; situacao: SituacaoFiltro; page: number }
  pageSize: number
}

export function CategoriasProdutosContent({ dados, loadError, idioma, filtroInicial, pageSize }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const m = getMessages(idioma).categorias_produtos
  const c = getMessages(idioma).cadastro_comum

  const [rows, setRows] = useState(dados.rows)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNome, setEditingNome] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState(filtroInicial.busca)
  const [situacao, setSituacao] = useState<SituacaoFiltro>(filtroInicial.situacao)
  const [rowParaExcluir, setRowParaExcluir] = useState<{ id: string; nome: string } | null>(null)

  const totalPaginas = Math.max(1, Math.ceil(dados.total / pageSize))
  const paginaAtual = filtroInicial.page

  function navegar(params: { busca?: string; situacao?: SituacaoFiltro; page?: number }) {
    const sp = new URLSearchParams()
    const b = params.busca ?? busca
    const s = params.situacao ?? situacao
    const p = params.page ?? 1
    if (b) sp.set('q', b)
    if (s !== 'todos') sp.set('situacao', s)
    if (p > 1) sp.set('page', String(p))
    router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname)
  }

  const handleCreate = async () => {
    if (!newNome.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await criarCategoriaProduto({ nome: newNome })
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
      const res = await atualizarCategoriaProduto({ id, nome: editingNome })
      if (!res.success) {
        setError(res.error)
        return
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, nome: editingNome } : r)))
      setEditingId(null)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAtivo = async (id: string, ativoAtual: boolean) => {
    setError(null)
    try {
      const res = await alternarAtivoCategoriaProduto(id, !ativoAtual)
      if (!res.success) {
        setError(res.error)
        return
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  const columns: Column<CategoriaProdutoRow>[] = [
    {
      key: 'nome',
      header: m.col_nome,
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-jl-fg-1">{r.nome}</span>
        </div>
      ),
    },
    {
      key: 'qtd_produtos',
      header: m.col_qtd_produtos,
      align: 'right',
      sortValue: (r) => r.qtd_produtos,
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{r.qtd_produtos}</span>,
    },
    {
      key: 'ativo',
      header: c.col_situacao,
      cell: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium ${
            r.ativo ? 'admin-v2-badge-success' : 'admin-v2-badge-danger'
          }`}
        >
          {r.ativo ? c.filtro_ativos : c.filtro_inativos}
        </span>
      ),
    },
    {
      key: 'actions',
      header: c.col_acoes,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleToggleAtivo(r.id, r.ativo)}
            className="rounded px-2 py-1 text-[12px] text-jl-fg-2 transition-colors hover:bg-white/[0.04]"
            title={r.ativo ? c.inativar : c.ativar}
            aria-label={r.ativo ? c.inativar : c.ativar}
          >
            {r.ativo ? '✓' : '○'}
          </button>
          <button
            onClick={() => {
              setEditingId(r.id)
              setEditingNome(r.nome)
            }}
            className="rounded p-1 text-jl-fg-3 transition-colors hover:bg-white/[0.04] hover:text-jl-fg-1"
            title={c.editar_categoria}
            aria-label={`${c.editar_categoria}: ${r.nome}`}
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => setRowParaExcluir({ id: r.id, nome: r.nome })}
            className="rounded p-1 text-jl-fg-3 transition-colors hover:bg-white/[0.04] hover:text-red-400"
            title={c.excluir}
            aria-label={`${c.excluir}: ${r.nome}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <SectionCard
      title={`${m.titulo} (${dados.total})`}
      action={
        <button onClick={() => setCreatingNew(true)} className="admin-v2-btn-primary">
          <Plus size={14} />
          {c.nova_categoria}
        </button>
      }
    >
      {loadError && (
        <div className="admin-v2-alert-danger mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]" role="alert">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {error && (
        <div className="admin-v2-alert-danger mb-4 rounded-lg px-3 py-2 text-[12px]" role="alert">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-jl-fg-3" aria-hidden />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navegar({ busca, page: 1 })
            }}
            placeholder={c.filtro_busca_placeholder}
            aria-label={c.filtro_busca}
            className="admin-v2-input w-full py-2 pl-9 pr-3 text-[12px] outline-none placeholder:text-jl-fg-3 focus:border-jl-accent/50"
          />
        </div>
        <select
          value={situacao}
          onChange={(e) => {
            const v = e.target.value as SituacaoFiltro
            setSituacao(v)
            navegar({ situacao: v, page: 1 })
          }}
          aria-label={c.filtro_situacao}
          className="admin-v2-input px-3 py-2 text-[12px] outline-none"
        >
          <option value="todos">{m.filtro_todos}</option>
          <option value="ativos">{c.filtro_ativos}</option>
          <option value="inativos">{c.filtro_inativos}</option>
        </select>
        <button onClick={() => navegar({ busca, page: 1 })} className="admin-v2-btn-secondary">
          {c.filtrar}
        </button>
        {(busca || situacao !== 'todos') && (
          <button
            onClick={() => {
              setBusca('')
              setSituacao('todos')
              navegar({ busca: '', situacao: 'todos', page: 1 })
            }}
            className="admin-v2-btn-secondary"
          >
            {c.limpar_filtros}
          </button>
        )}
      </div>

      {creatingNew && (
        <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              placeholder={m.nome_placeholder}
              aria-label={c.nome_label}
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreatingNew(false)
              }}
            />
            <button onClick={handleCreate} disabled={loading || !newNome.trim()} className="admin-v2-btn-primary disabled:opacity-50" aria-label={c.salvar}>
              <Check size={14} />
            </button>
            <button onClick={() => setCreatingNew(false)} className="admin-v2-btn-secondary" aria-label={c.cancelar}>
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
              onChange={(e) => setEditingNome(e.target.value)}
              placeholder={m.nome_placeholder}
              aria-label={c.nome_label}
              className="admin-v2-input flex-1 px-3 py-2 text-[12px] outline-none focus:border-jl-accent/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdate(editingId)
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
            <button onClick={() => handleUpdate(editingId)} disabled={loading || !editingNome.trim()} className="admin-v2-btn-primary disabled:opacity-50" aria-label={c.salvar}>
              <Check size={14} />
            </button>
            <button onClick={() => setEditingId(null)} className="admin-v2-btn-secondary" aria-label={c.cancelar}>
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
              📁
            </span>
            <p className="text-[13px] font-medium text-jl-fg-2">{c.sem_categorias}</p>
          </div>
        }
        className="rounded-none border-x-0 border-[var(--color-border-secondary)]"
      />

      {dados.total > pageSize && (
        <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-secondary)] pt-3">
          <button
            onClick={() => navegar({ page: paginaAtual - 1 })}
            disabled={paginaAtual <= 1}
            className="admin-v2-btn-secondary disabled:opacity-40"
          >
            {m.paginacao_anterior}
          </button>
          <span className="text-[11px] text-jl-fg-3">
            {m.paginacao_pagina_de.replace('{{atual}}', String(paginaAtual)).replace('{{total}}', String(totalPaginas))}
          </span>
          <button
            onClick={() => navegar({ page: paginaAtual + 1 })}
            disabled={paginaAtual >= totalPaginas}
            className="admin-v2-btn-secondary disabled:opacity-40"
          >
            {m.paginacao_proxima}
          </button>
        </div>
      )}

      <ConfirmExcluirCadastroModal
        row={rowParaExcluir}
        onClose={() => setRowParaExcluir(null)}
        onConfirmed={() => router.refresh()}
        excluirAction={excluirCategoriaProduto}
        labels={{
          confirmar_excluir_titulo: c.confirmar_excluir_titulo,
          confirmar_excluir_texto: c.confirmar_excluir_texto,
          cancelar: c.cancelar,
          excluindo: c.excluindo,
          excluir: c.excluir,
          excluido_sucesso: c.excluido_sucesso,
        }}
      />
    </SectionCard>
  )
}
