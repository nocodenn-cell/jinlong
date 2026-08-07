'use client'

/**
 * Categorias financeiras — paridade categorias-produto + taxonomia tipo (RFC-UX-016).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Check, X, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type {
  CategoriaFinanceiraRow,
  CategoriaFinanceiraTipo,
} from '@/app/gerente/categorias-financeiras/categoriasFinanceirasTypes'
import {
  criarCategoriaFinanceira,
  atualizarCategoriaFinanceira,
  alternarAtivoCategoriaFinanceira,
} from '@/app/gerente/categorias-financeiras/actions'
import { emitToast } from '@/lib/gerente/toast'

type Props = {
  idioma: Idioma
  dados: { rows: CategoriaFinanceiraRow[]; total: number }
  page: number
}

const TIPOS: CategoriaFinanceiraTipo[] = ['RECEITA', 'DESPESA', 'AMBOS']

function tipoLabel(
  tipo: CategoriaFinanceiraTipo,
  m: ReturnType<typeof getMessages>['categorias_financeiras'],
): string {
  if (tipo === 'RECEITA') return m.tipo_receita
  if (tipo === 'DESPESA') return m.tipo_despesa
  return m.tipo_ambos
}

export function CategoriasFinanceirasContent({ idioma, dados, page }: Props) {
  const router = useRouter()
  const labels = getMessages(idioma)
  const m = labels.categorias_financeiras
  const [rows, setRows] = useState(dados.rows)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNome, setEditingNome] = useState('')
  const [editingTipo, setEditingTipo] = useState<CategoriaFinanceiraTipo>('DESPESA')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newTipo, setNewTipo] = useState<CategoriaFinanceiraTipo>('DESPESA')
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
      const res = await criarCategoriaFinanceira({ nome: newNome, tipo: newTipo })
      if (!res.success) {
        setError(res.error)
        return
      }
      setNewNome('')
      setNewTipo('DESPESA')
      setCreatingNew(false)
      emitToast({ kind: 'success', message: m.salvo_sucesso })
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
      const res = await atualizarCategoriaFinanceira({
        id,
        nome: editingNome,
        tipo: editingTipo,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, nome: editingNome, tipo: editingTipo } : r)),
      )
      setEditingId(null)
      emitToast({ kind: 'success', message: m.salvo_sucesso })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAtivo(id: string, ativoAtual: boolean) {
    setError(null)
    try {
      const res = await alternarAtivoCategoriaFinanceira(id, !ativoAtual)
      if (!res.success) {
        setError(res.error)
        return
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r)))
      emitToast({ kind: 'success', message: m.situacao_atualizada })
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.comum.erro)
    }
  }

  const columns: Column<CategoriaFinanceiraRow>[] = [
    {
      key: 'nome',
      header: m.col_nome,
      sortValue: (r) => r.nome,
      cell: (r) => <span className="font-medium text-fg">{r.nome}</span>,
    },
    {
      key: 'tipo',
      header: m.col_tipo,
      cell: (r) => (
        <Badge className="border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-fg-muted">
          {tipoLabel(r.tipo, m)}
        </Badge>
      ),
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
        <PageActions>
          <Button type="button" variant="primary" className="gap-1.5" onClick={() => setCreatingNew(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {m.nova_categoria}
          </Button>
        </PageActions>
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
            <Field id="cat-fin-nova" label={m.nome_label} className="flex-1">
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
            <Field id="cat-fin-nova-tipo" label={m.tipo_label} className="w-full sm:w-40">
              <Select
                value={newTipo}
                onChange={(e) => setNewTipo(e.target.value as CategoriaFinanceiraTipo)}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {tipoLabel(t, m)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="icon"
                disabled={loading || !newNome.trim()}
                onClick={() => void handleCreate()}
              >
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
            <Field id="cat-fin-edit" label={m.editar_categoria} className="flex-1">
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
            <Field id="cat-fin-edit-tipo" label={m.tipo_label} className="w-full sm:w-40">
              <Select
                value={editingTipo}
                onChange={(e) => setEditingTipo(e.target.value as CategoriaFinanceiraTipo)}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {tipoLabel(t, m)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="icon"
                disabled={loading || !editingNome.trim()}
                onClick={() => void handleUpdate(editingId)}
              >
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
            icon={<WalletCards className="h-6 w-6" aria-hidden />}
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
                setEditingTipo(r.tipo)
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
