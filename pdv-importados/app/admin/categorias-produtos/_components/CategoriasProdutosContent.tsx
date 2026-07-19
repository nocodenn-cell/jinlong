'use client'

/**
 * FastProduct Admin — Categorias de Produtos (Catálogo Onda 5).
 * Contrato CRUD: toolbar · DataTable · empty/loading · ações inline.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Check, X, FolderOpen } from 'lucide-react'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input, SearchInput } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import type { CategoriaProdutoRow } from '@/app/gerente/categorias-produtos/categoriasProdutosTypes'
import {
  criarCategoriaProduto,
  atualizarCategoriaProduto,
  alternarAtivoCategoriaProduto,
} from '@/app/gerente/categorias-produtos/actions'

type SituacaoFiltro = 'todos' | 'ativos' | 'inativos'

type Props = {
  idioma: Idioma
  dados: { rows: CategoriaProdutoRow[]; total: number }
  buscaInicial: string
  situacaoInicial: SituacaoFiltro
  page: number
}

export function CategoriasProdutosContent({
  idioma,
  dados,
  buscaInicial,
  situacaoInicial,
  page,
}: Props) {
  const router = useRouter()
  const labels = getMessages(idioma)
  const m = labels.categorias_produtos
  const [rows, setRows] = useState(dados.rows)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNome, setEditingNome] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [termo, setTermo] = useState(buscaInicial)
  const [situacao, setSituacao] = useState<SituacaoFiltro>(situacaoInicial)

  const termoDebounced = useDebounce(termo, 280)
  const skipMountRef = useRef(true)

  useEffect(() => {
    setRows(dados.rows)
  }, [dados.rows])

  useEffect(() => {
    setTermo(buscaInicial)
    setSituacao(situacaoInicial)
  }, [buscaInicial, situacaoInicial])

  useEffect(() => {
    if (skipMountRef.current) {
      skipMountRef.current = false
      return
    }
    const p = new URLSearchParams()
    if (termoDebounced) p.set('q', termoDebounced)
    if (situacao !== 'todos') p.set('situacao', situacao)
    router.push(pathWithQuery(ROUTES.admin.categoriasProdutos, p))
  }, [termoDebounced, situacao, router])

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

  const situacaoOptions: SituacaoFiltro[] = ['todos', 'ativos', 'inativos']

  const columns: Column<CategoriaProdutoRow>[] = [
    {
      key: 'nome',
      header: m.col_nome,
      sortValue: (r) => r.nome,
      cell: (r) => <span className="font-medium text-fg">{r.nome}</span>,
    },
    {
      key: 'qtd_produtos',
      header: m.col_qtd_produtos,
      align: 'right',
      sortValue: (r) => r.qtd_produtos,
      cell: (r) => <span className="tabular-nums text-caption text-fg-muted">{r.qtd_produtos}</span>,
    },
    {
      key: 'ativo',
      header: m.col_situacao,
      cell: (r) => (
        <Badge
          className={
            r.ativo
              ? 'border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]'
              : 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
          }
        >
          {r.ativo ? labels.funcionarios.ativo : labels.funcionarios.inativo}
        </Badge>
      ),
    },
  ]

  const countLabel = `${dados.total} ${dados.total === 1 ? m.categoria_singular : m.categorias_plural}`

  return (
    <CrudListShell
      title={m.lista_titulo}
      meta={<span className="text-caption text-fg-subtle">{countLabel}</span>}
      toolbar={
        <>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="min-w-[240px] max-w-[420px] flex-1">
              <SearchInput
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder={m.filtro_busca_placeholder}
                aria-label={m.filtro_busca}
                controlSize="sm"
              />
            </div>
            <div
              className="inline-flex items-center gap-0.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-0.5"
              role="group"
            >
              {situacaoOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSituacao(s)}
                  aria-pressed={situacao === s}
                  className={cn(
                    'fp-focus-ring rounded-sm px-2.5 py-1 text-caption font-medium',
                    situacao === s
                      ? 'bg-[var(--color-info-bg)] text-brand'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  {m[`filtro_${s}` as keyof typeof m] as string}
                </button>
              ))}
            </div>
          </div>
          <PageActions>
            <Button type="button" variant="primary" className="gap-1.5" onClick={() => setCreatingNew(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              {m.nova_categoria}
            </Button>
          </PageActions>
        </>
      }
      footer={
        dados.total > 50 ? (
          <span className="text-caption text-fg-subtle">
            Página {page} de {Math.ceil(dados.total / 50)} · {dados.total} {m.categorias_plural}
          </span>
        ) : undefined
      }
    >
      {error ? <ErrorState dense description={error} className="mb-4 items-start text-left" /> : null}

      {creatingNew ? (
        <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field id="cat-nova" label={m.nome_label} className="flex-1">
              <Input
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                placeholder={m.nome_placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate()
                  if (e.key === 'Escape') setCreatingNew(false)
                }}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="primary" size="icon" disabled={loading || !newNome.trim()} onClick={() => void handleCreate()}>
                <Check className="h-4 w-4" aria-hidden />
              </Button>
              <Button type="button" variant="secondary" size="icon" onClick={() => setCreatingNew(false)}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editingId ? (
        <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field id="cat-edit" label={m.editar_categoria} className="flex-1">
              <Input
                value={editingNome}
                onChange={(e) => setEditingNome(e.target.value)}
                placeholder={m.nome_placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleUpdate(editingId)
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="primary" size="icon" disabled={loading || !editingNome.trim()} onClick={() => void handleUpdate(editingId)}>
                <Check className="h-4 w-4" aria-hidden />
              </Button>
              <Button type="button" variant="secondary" size="icon" onClick={() => setEditingId(null)}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <EmptyState
            icon={<FolderOpen className="h-6 w-6" aria-hidden />}
            title={m.sem_categorias}
            description={m.cadastro_rapido_hint}
            actionLabel={m.nova_categoria}
            onAction={() => setCreatingNew(true)}
          />
        }
        rowActions={(r) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handleToggleAtivo(r.id, r.ativo)}
            >
              {r.ativo ? m.inativar : m.ativar}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={m.editar_categoria}
              onClick={() => {
                setEditingId(r.id)
                setEditingNome(r.nome)
              }}
            >
              <Edit2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}
        className="rounded-none border-x-0 border-b-0"
      />
    </CrudListShell>
  )
}
