'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import {
  definirAtivoFuncionarioAction,
  type FuncionarioListRow,
} from './actions'
import { FuncionarioEditarModal, type FuncionarioModalLabels } from './FuncionarioEditarModal'
import { podeDesativarAlvo } from './funcionarioPolicies'
import { motivoBloqueioEditar, motivoBloqueioToggle } from './funcionarioUi'

export type FuncionariosListLabels = {
  contagem: string
  novo: string
  buscaPlaceholder: string
  colNome: string
  colEmail: string
  colPerfil: string
  colStatus: string
  colAcoes: string
  ativo: string
  inativo: string
  vazioTitulo: string
  vazioSub: string
  vazioBuscaTitulo: string
  vazioBuscaSub: string
  limparFiltros: string
  ativar: string
  desativar: string
  editar: string
  perfilOperador: string
  perfilGerente: string
  perfilDono: string
  perfilAdmin: string
  filtroStatusLabel: string
  filtroTodos: string
  filtroAtivos: string
  filtroInativos: string
  confirmarDesativar: string
  confirmarReativar: string
  somenteLeitura: string
  bloqueioDonoAdmin: string
  bloqueioSemPermissao: string
  bloqueioSiMesmo: string
  modal: FuncionarioModalLabels
}

type Props = {
  atorId: string
  atorPerfil: string
  iniciais: FuncionarioListRow[]
  labels: FuncionariosListLabels
}

type StatusFiltro = 'todos' | 'ativos' | 'inativos'

function labelPerfil(perfil: string, L: FuncionariosListLabels): string {
  if (perfil === 'OPERADOR') return L.perfilOperador
  if (perfil === 'GERENTE') return L.perfilGerente
  if (perfil === 'DONO') return L.perfilDono
  if (perfil === 'ADMIN') return L.perfilAdmin
  return perfil
}

function perfilBadgeClass(perfil: string): string {
  if (perfil === 'OPERADOR') {
    return 'border border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-brand'
  }
  if (perfil === 'GERENTE') {
    return 'border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]'
  }
  return 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-subtle'
}

function statusBadgeClass(ativo: boolean): string {
  return ativo
    ? 'border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]'
    : 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-subtle'
}

export function FuncionariosListClient({ atorId, atorPerfil, iniciais, labels: L }: Props) {
  const [rows, setRows] = useState(iniciais)
  const [termo, setTermo] = useState('')
  const [statusF, setStatusF] = useState<StatusFiltro>('todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<FuncionarioListRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const q = termo.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusF === 'ativos' && !r.ativo) return false
      if (statusF === 'inativos' && r.ativo) return false
      if (!q) return true
      return (
        r.nome.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        r.perfil.toLowerCase().includes(q) ||
        labelPerfil(r.perfil, L).toLowerCase().includes(q)
      )
    })
  }, [rows, termo, statusF, L])

  const temFiltroAtivo = termo.trim().length > 0 || statusF !== 'todos'
  const ator = { id: atorId, perfil: atorPerfil }
  const statusOptions: StatusFiltro[] = ['todos', 'ativos', 'inativos']

  function abrirNovo() {
    setEmEdicao(null)
    setModalAberto(true)
  }

  function limparFiltros() {
    setTermo('')
    setStatusF('todos')
  }

  async function toggleAtivo(row: FuncionarioListRow) {
    if (!podeDesativarAlvo(ator, row)) {
      emitGerenteToast({
        kind: 'error',
        message: motivoBloqueioToggle(ator, row, L) ?? L.bloqueioSemPermissao,
      })
      return
    }
    setBusyId(row.id)
    try {
      const r = await definirAtivoFuncionarioAction(row.id, !row.ativo)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setRows((cur) => cur.map((x) => (x.id === row.id ? { ...x, ativo: r.data.ativo } : x)))
    } finally {
      setBusyId(null)
    }
  }

  function pedirToggle(row: FuncionarioListRow) {
    const bloqueio = motivoBloqueioToggle(ator, row, L)
    if (bloqueio) {
      emitGerenteToast({ kind: 'error', message: bloqueio })
      return
    }
    const msg = (row.ativo ? L.confirmarDesativar : L.confirmarReativar).replace('{nome}', row.nome)
    if (!globalThis.confirm(msg)) return
    void toggleAtivo(row)
  }

  const filtroLabel = (s: StatusFiltro) => {
    if (s === 'ativos') return L.filtroAtivos
    if (s === 'inativos') return L.filtroInativos
    return L.filtroTodos
  }

  const columns: Column<FuncionarioListRow>[] = [
    {
      key: 'nome',
      header: L.colNome,
      priority: 'primary',
      cell: (row) => (
        <span className={cn('font-medium text-fg', !row.ativo && 'text-fg-subtle')}>{row.nome}</span>
      ),
    },
    {
      key: 'email',
      header: L.colEmail,
      cell: (row) => <span className="text-caption text-fg-muted">{row.email ?? '—'}</span>,
    },
    {
      key: 'perfil',
      header: L.colPerfil,
      width: '120px',
      cell: (row) => (
        <Badge className={perfilBadgeClass(row.perfil)}>{labelPerfil(row.perfil, L)}</Badge>
      ),
    },
    {
      key: 'status',
      header: L.colStatus,
      width: '100px',
      cell: (row) => (
        <Badge className={statusBadgeClass(row.ativo)}>{row.ativo ? L.ativo : L.inativo}</Badge>
      ),
    },
  ]

  return (
    <>
      <CrudListShell
        title={`${filtrados.length} ${L.contagem}`}
        toolbar={
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="min-w-[240px] max-w-[420px] flex-1">
                <SearchInput
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder={L.buscaPlaceholder}
                  aria-label={L.buscaPlaceholder}
                  controlSize="sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption font-medium text-fg-muted">{L.filtroStatusLabel}</span>
                <div
                  className="inline-flex items-center gap-0.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-0.5"
                  role="group"
                  aria-label={L.filtroStatusLabel}
                >
                  {statusOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusF(s)}
                      aria-pressed={statusF === s}
                      className={cn(
                        'fp-focus-ring rounded-sm px-2.5 py-1 text-caption font-medium',
                        statusF === s
                          ? 'bg-[var(--color-info-bg)] text-brand'
                          : 'text-fg-subtle hover:text-fg',
                      )}
                    >
                      {filtroLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <PageActions>
              <Button type="button" variant="primary" onClick={abrirNovo} className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                {L.novo}
              </Button>
            </PageActions>
          </>
        }
      >
        <DataTable
          columns={columns}
          data={filtrados}
          rowKey={(row) => row.id}
          compact
          emptyState={
            rows.length === 0 ? (
              <EmptyState
                title={L.vazioTitulo}
                description={L.vazioSub}
                actionLabel={L.novo}
                onAction={abrirNovo}
              />
            ) : (
              <EmptyState
                title={L.vazioBuscaTitulo}
                description={L.vazioBuscaSub}
                actionLabel={temFiltroAtivo ? L.limparFiltros : undefined}
                onAction={temFiltroAtivo ? limparFiltros : undefined}
              />
            )
          }
          rowActions={(row) => {
            const bloqueioEditar = motivoBloqueioEditar(ator, row, L)
            const bloqueioToggle = motivoBloqueioToggle(ator, row, L)
            const podeEditar = !bloqueioEditar
            const podeToggle = !bloqueioToggle
            const toggleLabel = row.ativo ? L.desativar : L.ativar

            if (!podeEditar && !podeToggle) {
              return (
                <span
                  className="text-caption text-fg-subtle"
                  title={bloqueioEditar ?? L.somenteLeitura}
                  aria-label={bloqueioEditar ?? L.somenteLeitura}
                >
                  {L.somenteLeitura}
                </span>
              )
            }

            return (
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!podeEditar}
                  title={bloqueioEditar ?? L.editar}
                  aria-label={
                    bloqueioEditar ? `${L.editar}: ${bloqueioEditar}` : `${L.editar} — ${row.nome}`
                  }
                  onClick={() => {
                    if (bloqueioEditar) {
                      emitGerenteToast({ kind: 'error', message: bloqueioEditar })
                      return
                    }
                    setEmEdicao(row)
                    setModalAberto(true)
                  }}
                  className="gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {L.editar}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!podeToggle || busyId === row.id}
                  title={bloqueioToggle ?? toggleLabel}
                  aria-label={
                    bloqueioToggle
                      ? `${toggleLabel}: ${bloqueioToggle}`
                      : `${toggleLabel} — ${row.nome}`
                  }
                  onClick={() => pedirToggle(row)}
                  className={cn(
                    'gap-1',
                    row.ativo && podeToggle && 'text-[var(--color-danger-strong)]',
                  )}
                >
                  {toggleLabel}
                </Button>
              </div>
            )
          }}
          className="rounded-none border-x-0 border-b-0"
        />
      </CrudListShell>

      {modalAberto ? (
        <FuncionarioEditarModal
          labels={L.modal}
          atorPerfil={atorPerfil}
          funcionario={emEdicao}
          onClose={() => {
            setModalAberto(false)
            setEmEdicao(null)
          }}
          onSalvo={(row) => {
            setRows((cur) => {
              const idx = cur.findIndex((x) => x.id === row.id)
              if (idx < 0) return [...cur, row].sort((a, b) => a.nome.localeCompare(b.nome))
              const next = [...cur]
              next[idx] = row
              return next
            })
          }}
        />
      ) : null}
    </>
  )
}
