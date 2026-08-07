'use client'

/**
 * Marcas de Produtos — lista/CRUD (filtros no PageShell/FilterBar — Sprint 5).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Edit2, Plus, Tag, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import {
  alternarAtivoMarcaProduto,
  atualizarMarcaProduto,
  criarMarcaProduto,
  type MarcaProdutoRow,
} from '@/app/gerente/marcas-produtos/actions'

type Props = {
  idioma: Idioma
  dados: { rows: MarcaProdutoRow[]; total: number }
  page: number
}

export function MarcasProdutosContent({ idioma, dados, page }: Props) {
  const router = useRouter()
  const labels = getMessages(idioma)
  const m = labels.marcas_produtos
  const [rows, setRows] = useState(dados.rows)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNome, setEditingNome] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setRows(dados.rows)
  }, [dados.rows])

  async function handleCreate() {
    if (!newNome.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await criarMarcaProduto({ nome: newNome })
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

  async function handleUpdate(id: string) {
    if (!editingNome.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await atualizarMarcaProduto({ id, nome: editingNome })
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

  async function handleToggleAtivo(id: string, ativoAtual: boolean) {
    setError(null)
    const res = await alternarAtivoMarcaProduto(id, !ativoAtual)
    if (!res.success) {
      setError(res.error)
      return
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r)))
  }

  const columns: Column<MarcaProdutoRow>[] = [
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

  const countLabel = `${dados.total} ${dados.total === 1 ? m.marca_singular : m.marcas_plural}`

  return (
    <CrudListShell
      title={m.lista_titulo}
      meta={<span className="text-caption text-fg-subtle">{countLabel}</span>}
      toolbar={
        <PageActions>
          <Button type="button" variant="primary" className="gap-1.5" onClick={() => setCreatingNew(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {m.nova_marca}
          </Button>
        </PageActions>
      }
      footer={
        dados.total > 50 ? (
          <span className="text-caption text-fg-subtle">
            {`${page} / ${Math.ceil(dados.total / 50)} · ${dados.total} ${m.marcas_plural}`}
          </span>
        ) : undefined
      }
    >
      {error ? <ErrorState dense description={error} className="mb-4 items-start text-left" /> : null}

      {creatingNew ? (
        <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field id="marca-nova" label={m.nome_label} className="flex-1">
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
            <Field id="marca-edit" label={m.editar_marca} className="flex-1">
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
            icon={<Tag className="h-6 w-6" aria-hidden />}
            title={m.sem_marcas}
            description={m.cadastro_rapido_hint}
            actionLabel={m.nova_marca}
            onAction={() => setCreatingNew(true)}
          />
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`${m.editar_marca} ${row.nome}`}
              title={m.editar_marca}
              onClick={() => {
                setEditingId(row.id)
                setEditingNome(row.nome)
              }}
            >
              <Edit2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`${row.ativo ? m.inativar : m.ativar} ${row.nome}`}
              title={row.ativo ? m.inativar : m.ativar}
              onClick={() => void handleToggleAtivo(row.id, row.ativo)}
            >
              {row.ativo ? (
                <ToggleRight className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ToggleLeft className="h-3.5 w-3.5" aria-hidden />
              )}
            </Button>
          </div>
        )}
      />
    </CrudListShell>
  )
}
