'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusChip } from '@/components/ui/StatusChip'
import { SearchInput } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { DragonModal } from '@/components/ui/DragonModal'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/navigation/routes'
import {
  definirAtivoFuncionarioAction,
  type FuncionarioListRow,
} from './actions'
import { FuncionarioEditarModal, type FuncionarioModalLabels } from './FuncionarioEditarModal'
import { FuncionarioRowActions } from './FuncionarioRowActions'
import { podeDesativarAlvo } from './funcionarioPolicies'
import {
  agruparFuncionarios,
  isTypingTarget,
  motivoBloqueioEditar,
  motivoBloqueioToggle,
  type FuncionarioGrupoId,
} from './funcionarioUi'
import {
  FUNCIONARIOS_LISTA_KEY,
  gravarFuncionariosListaEstado,
  lerFuncionariosListaEstado,
  type PerfilFiltro,
  type StatusFiltro,
} from './funcionarioListaEstado'

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
  verComissoes: string
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
  confirmarTituloDesativar: string
  confirmarTituloReativar: string
  confirmarAcao: string
  somenteLeitura: string
  bloqueioDonoAdmin: string
  bloqueioSemPermissao: string
  bloqueioSiMesmo: string
  atalhoBusca: string
  atalhoNovo: string
  grupoEquipe: string
  grupoEquipeSub: string
  grupoProtegido: string
  grupoProtegidoSub: string
  grupoAdminOnde: string
  grupoAdminLink: string
  menuMais: string
  filtroPerfilLabel: string
  filtroPerfilTodos: string
  filtroPerfilOperador: string
  filtroPerfilGerente: string
  colFuncionario: string
  modal: FuncionarioModalLabels
}

type Props = {
  atorId: string
  atorPerfil: string
  iniciais: FuncionarioListRow[]
  labels: FuncionariosListLabels
}

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

function renderStatusChip(ativo: boolean, L: { ativo: string; inativo: string }) {
  return <StatusChip status={ativo ? 'ATIVO' : 'INATIVO'} label={ativo ? L.ativo : L.inativo} />
}

function grupoTitulo(id: FuncionarioGrupoId, total: number, L: FuncionariosListLabels): string {
  const nome = id === 'equipe' ? L.grupoEquipe : L.grupoProtegido
  return `${nome} (${total})`
}

function GrupoFuncionarios({
  id,
  rows,
  L,
  adminAberto,
  onToggleAdmin,
  atorPerfil,
  children,
}: {
  id: FuncionarioGrupoId
  rows: { length: number }
  L: FuncionariosListLabels
  adminAberto: boolean
  onToggleAdmin: () => void
  atorPerfil: string
  children: ReactNode
}) {
  const titulo = grupoTitulo(id, rows.length, L)
  const sub = id === 'equipe' ? L.grupoEquipeSub : L.grupoProtegidoSub
  if (id === 'protegido' && !adminAberto) {
    return (
      <section className="space-y-2">
        <button type="button" className="px-1 text-left" aria-expanded={false} onClick={onToggleAdmin}>
          <h3 className="text-small font-semibold text-fg">{titulo}</h3>
          <p className="text-caption text-fg-subtle">{sub}</p>
        </button>
      </section>
    )
  }
  return (
    <section className="space-y-2">
      {id === 'protegido' ? (
        <button type="button" className="px-1 text-left" aria-expanded onClick={onToggleAdmin}>
          <h3 className="text-small font-semibold text-fg">{titulo}</h3>
        </button>
      ) : (
        <header className="px-1">
          <h3 className="text-small font-semibold text-fg">{titulo}</h3>
          <p className="text-caption text-fg-subtle">{sub}</p>
        </header>
      )}
      {id === 'protegido' ? <NotaAdmin L={L} atorPerfil={atorPerfil} /> : null}
      {children}
    </section>
  )
}

function NotaAdmin({ L, atorPerfil }: { L: FuncionariosListLabels; atorPerfil: string }) {
  return (
    <p className="px-1 text-caption text-fg-subtle">
      {L.grupoAdminOnde}{' '}
      {atorPerfil === 'ADMIN' ? (
        <Link href={ROUTES.admin.provisionamento} className="text-brand hover:underline">
          {L.grupoAdminLink}
        </Link>
      ) : null}
    </p>
  )
}

export function FuncionariosListClient({ atorId, atorPerfil, iniciais, labels: L }: Props) {
  const [rows, setRows] = useState(iniciais)
  const [termo, setTermo] = useState('')
  const [statusF, setStatusF] = useState<StatusFiltro>('todos')
  const [perfilF, setPerfilF] = useState<PerfilFiltro>('todos')
  const [adminAberto, setAdminAberto] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<FuncionarioListRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmRow, setConfirmRow] = useState<FuncionarioListRow | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtrados = useMemo(() => {
    const q = termo.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusF === 'ativos' && !r.ativo) return false
      if (statusF === 'inativos' && r.ativo) return false
      if (perfilF !== 'todos' && r.perfil !== perfilF) return false
      if (!q) return true
      return (
        r.nome.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        r.perfil.toLowerCase().includes(q) ||
        labelPerfil(r.perfil, L).toLowerCase().includes(q)
      )
    })
  }, [rows, termo, statusF, perfilF, L])

  const grupos = useMemo(() => agruparFuncionarios(filtrados), [filtrados])
  const temFiltroAtivo = termo.trim().length > 0 || statusF !== 'todos' || perfilF !== 'todos'
  const ator = { id: atorId, perfil: atorPerfil }
  const statusOptions: StatusFiltro[] = ['todos', 'ativos', 'inativos']
  const confirmBusy = !!confirmRow && busyId === confirmRow.id

  function abrirNovo() {
    setEmEdicao(null)
    setModalAberto(true)
  }

  function abrirEditar(row: FuncionarioListRow) {
    const bloqueio = motivoBloqueioEditar(ator, row, L)
    if (bloqueio) {
      emitGerenteToast({ kind: 'error', message: bloqueio })
      return
    }
    setEmEdicao(row)
    setModalAberto(true)
  }

  function limparFiltros() {
    setTermo('')
    setStatusF('todos')
    setPerfilF('todos')
  }

  function gravarLista(scrollY?: number) {
    gravarFuncionariosListaEstado(sessionStorage, {
      termo,
      status: statusF,
      perfil: perfilF,
      adminAberto,
      scrollY,
    })
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
      setConfirmRow(null)
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
    setConfirmRow(row)
  }

  useEffect(() => {
    const salvo = lerFuncionariosListaEstado(sessionStorage.getItem(FUNCIONARIOS_LISTA_KEY))
    if (salvo) {
      setTermo(salvo.termo)
      setStatusF(salvo.status)
      setPerfilF(salvo.perfil)
      setAdminAberto(salvo.adminAberto)
      requestAnimationFrame(() => window.scrollTo(0, salvo.scrollY))
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    gravarFuncionariosListaEstado(sessionStorage, {
      termo,
      status: statusF,
      perfil: perfilF,
      adminAberto,
    })
    const onScroll = () => {
      gravarFuncionariosListaEstado(sessionStorage, {
        termo,
        status: statusF,
        perfil: perfilF,
        adminAberto,
        scrollY: window.scrollY,
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hydrated, termo, statusF, perfilF, adminAberto])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modalAberto || confirmRow) return
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        setEmEdicao(null)
        setModalAberto(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalAberto, confirmRow])

  const filtroLabel = (s: StatusFiltro) => {
    if (s === 'ativos') return L.filtroAtivos
    if (s === 'inativos') return L.filtroInativos
    return L.filtroTodos
  }

  const columns: Column<FuncionarioListRow>[] = [
    {
      key: 'nome',
      header: L.colFuncionario,
      priority: 'primary',
      sortValue: (row) => row.nome.toLocaleLowerCase(),
      cell: (row) => (
        <div className="min-w-0">
          <div className={cn('truncate font-medium text-fg', !row.ativo && 'text-fg-subtle')}>{row.nome}</div>
          <div className="truncate text-caption text-fg-muted">{row.email ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'perfil',
      header: L.colPerfil,
      width: '120px',
      sortValue: (row) => labelPerfil(row.perfil, L),
      cell: (row) => (
        <Badge className={perfilBadgeClass(row.perfil)}>{labelPerfil(row.perfil, L)}</Badge>
      ),
    },
    {
      key: 'status',
      header: L.colStatus,
      width: '100px',
      sortValue: (row) => (row.ativo ? 1 : 0),
      cell: (row) => renderStatusChip(row.ativo, L),
    },
  ]

  const emptyState =
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

  const actionsProps = {
    ator,
    labels: L,
    onEditar: abrirEditar,
    onToggle: pedirToggle,
    onBeforeNavigate: () => gravarLista(window.scrollY),
  }

  const confirmTitle = confirmRow
    ? confirmRow.ativo
      ? L.confirmarTituloDesativar
      : L.confirmarTituloReativar
    : ''
  const confirmBody = confirmRow
    ? (confirmRow.ativo ? L.confirmarDesativar : L.confirmarReativar).replace(
        '{nome}',
        confirmRow.nome,
      )
    : ''

  return (
    <>
      <CrudListShell
        title={`${filtrados.length} ${L.contagem}`}
        toolbar={
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="min-w-[200px] max-w-[420px] flex-1">
                <SearchInput
                  ref={searchRef}
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder={L.buscaPlaceholder}
                  aria-label={`${L.buscaPlaceholder} (${L.atalhoBusca})`}
                  title={L.atalhoBusca}
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
                <label className="flex items-center gap-2 text-caption text-fg-muted">
                  {L.filtroPerfilLabel}
                  <select
                    value={perfilF}
                    aria-label={L.filtroPerfilLabel}
                    data-testid="funcionario-filtro-perfil"
                    className="min-h-9 rounded-control border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-caption text-fg"
                    onChange={(e) => setPerfilF(e.target.value as PerfilFiltro)}
                  >
                    <option value="todos">{L.filtroPerfilTodos}</option>
                    <option value="OPERADOR">{L.filtroPerfilOperador}</option>
                    <option value="GERENTE">{L.filtroPerfilGerente}</option>
                  </select>
                </label>
              </div>
            </div>
            <PageActions>
              <Button
                type="button"
                variant="primary"
                onClick={abrirNovo}
                className="gap-1.5"
                title={L.atalhoNovo}
              >
                <Plus className="h-4 w-4" aria-hidden />
                {L.novo}
              </Button>
            </PageActions>
          </>
        }
      >
        {filtrados.length === 0 ? (
          emptyState
        ) : (
          <>
            <div className="hidden space-y-6 md:block">
              {grupos.map((grupo) => (
                <GrupoFuncionarios
                  key={grupo.id}
                  id={grupo.id}
                  rows={grupo.rows}
                  L={L}
                  adminAberto={adminAberto}
                  onToggleAdmin={() => setAdminAberto((v) => !v)}
                  atorPerfil={atorPerfil}
                >
                  <DataTable
                    columns={columns}
                    data={grupo.rows}
                    rowKey={(row) => row.id}
                    compact
                    stickyHeader
                    onRowClick={abrirEditar}
                    rowActions={(row) => (
                      <FuncionarioRowActions row={row} busy={busyId === row.id} {...actionsProps} />
                    )}
                    className="rounded-none border-x-0 border-b-0"
                  />
                </GrupoFuncionarios>
              ))}
            </div>

            <div className="space-y-5 md:hidden">
              {grupos.map((grupo) => (
                <GrupoFuncionarios
                  key={grupo.id}
                  id={grupo.id}
                  rows={grupo.rows}
                  L={L}
                  adminAberto={adminAberto}
                  onToggleAdmin={() => setAdminAberto((v) => !v)}
                  atorPerfil={atorPerfil}
                >
                  <ul className="flex flex-col gap-2">
                    {grupo.rows.map((row) => {
                      const bloqueio = motivoBloqueioEditar(ator, row, L)
                      return (
                        <li key={row.id}>
                          <article
                            className={cn(
                              'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3',
                              !bloqueio && 'fp-focus-ring cursor-pointer hover:bg-[var(--color-surface-soft)]',
                              !row.ativo && 'opacity-80',
                            )}
                            tabIndex={bloqueio ? undefined : 0}
                            role={bloqueio ? undefined : 'button'}
                            aria-label={
                              bloqueio
                                ? `${row.nome} — ${bloqueio}`
                                : `${L.editar} — ${row.nome}`
                            }
                            onClick={() => {
                              if (!bloqueio) abrirEditar(row)
                            }}
                            onKeyDown={(e) => {
                              if (bloqueio) return
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                abrirEditar(row)
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-fg">{row.nome}</p>
                                <p className="truncate text-caption text-fg-muted">
                                  {row.email ?? '—'}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <Badge className={perfilBadgeClass(row.perfil)}>
                                    {labelPerfil(row.perfil, L)}
                                  </Badge>
                                  {renderStatusChip(row.ativo, L)}
                                </div>
                              </div>
                              <FuncionarioRowActions
                                row={row}
                                busy={busyId === row.id}
                                {...actionsProps}
                              />
                            </div>
                          </article>
                        </li>
                      )
                    })}
                  </ul>
                </GrupoFuncionarios>
              ))}
            </div>
          </>
        )}
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

      {confirmRow ? (
        <DragonModal
          open
          onClose={() => {
            if (!confirmBusy) setConfirmRow(null)
          }}
          title={confirmTitle}
          variant={confirmRow.ativo ? 'danger' : 'default'}
          icon={AlertTriangle}
          size="sm"
          dismissable={!confirmBusy}
          data-testid="funcionario-confirm-toggle"
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={confirmBusy}
                onClick={() => setConfirmRow(null)}
              >
                {L.modal.cancelar}
              </Button>
              <Button
                type="button"
                variant={confirmRow.ativo ? 'danger' : 'primary'}
                disabled={confirmBusy}
                onClick={() => void toggleAtivo(confirmRow)}
              >
                {confirmBusy ? L.modal.salvando : L.confirmarAcao}
              </Button>
            </>
          }
        >
          <p className="text-body text-fg-muted">{confirmBody}</p>
        </DragonModal>
      ) : null}
    </>
  )
}
