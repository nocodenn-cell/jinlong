'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, UserX, UserCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { EntityTable, type EntityColumn } from '@/components/ui/EntityTable'
import { EmptyState } from '@/components/ui/feedback'
import { emitToast } from '@/lib/gerente/toast'
import { askConfirm } from '@/lib/ui/askConfirm'
import {
  definirAtivoFuncionarioAction,
  type FuncionarioListRow,
} from './actions'
import { FuncionarioEditarModal, type FuncionarioModalLabels } from './FuncionarioEditarModal'
import { podeDesativarAlvo, podeEditarAlvo } from './funcionarioPolicies'

export type FuncionariosListLabels = {
  listaTitulo: string
  contagem: string
  novo: string
  buscaPlaceholder: string
  colNome: string
  colEmail: string
  colPerfil: string
  colIdioma: string
  colStatus: string
  colAcoes: string
  ativo: string
  inativo: string
  vazio: string
  ativar: string
  desativar: string
  editar: string
  perfilOperador: string
  perfilGerente: string
  perfilDono: string
  perfilAdmin: string
  filtroTodos: string
  filtroAtivos: string
  filtroInativos: string
  confirmDesativarTitulo: string
  confirmDesativarDesc: string
  confirmAtivarTitulo: string
  confirmAtivarDesc: string
  confirmOk: string
  confirmCancel: string
  toastDesativado: string
  toastAtivado: string
  modal: FuncionarioModalLabels
}

type Props = {
  atorId: string
  atorPerfil: string
  iniciais: FuncionarioListRow[]
  busca: string
  situacao: 'todos' | 'ativos' | 'inativos'
  labels: FuncionariosListLabels
}

function labelPerfil(perfil: string, L: FuncionariosListLabels): string {
  if (perfil === 'OPERADOR') return L.perfilOperador
  if (perfil === 'GERENTE') return L.perfilGerente
  if (perfil === 'DONO') return L.perfilDono
  if (perfil === 'ADMIN') return L.perfilAdmin
  return perfil
}

function matchesFiltro(
  row: FuncionarioListRow,
  busca: string,
  situacao: Props['situacao'],
): boolean {
  if (situacao === 'ativos' && !row.ativo) return false
  if (situacao === 'inativos' && row.ativo) return false
  const q = busca.trim().toLowerCase()
  if (!q) return true
  return (
    row.nome.toLowerCase().includes(q) ||
    (row.email ?? '').toLowerCase().includes(q) ||
    row.perfil.toLowerCase().includes(q)
  )
}

export function FuncionariosListClient({
  atorId,
  atorPerfil,
  iniciais,
  busca,
  situacao,
  labels: L,
}: Props) {
  const [rows, setRows] = useState(iniciais)
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<FuncionarioListRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setRows(iniciais)
  }, [iniciais])

  const filtrados = useMemo(
    () => rows.filter((r) => matchesFiltro(r, busca, situacao)),
    [rows, busca, situacao],
  )

  const ator = { id: atorId, perfil: atorPerfil }

  async function toggleAtivo(row: FuncionarioListRow) {
    if (!podeDesativarAlvo(ator, row)) {
      emitToast({
        kind: 'error',
        message: row.ativo ? 'Não é possível desativar esta conta.' : 'Não é possível reativar esta conta.',
      })
      return
    }

    const ok = await askConfirm({
      title: row.ativo ? L.confirmDesativarTitulo : L.confirmAtivarTitulo,
      description: row.ativo
        ? L.confirmDesativarDesc.replace('{{nome}}', row.nome)
        : L.confirmAtivarDesc.replace('{{nome}}', row.nome),
      confirmLabel: L.confirmOk,
      cancelLabel: L.confirmCancel,
      variant: row.ativo ? 'danger' : 'neutral',
    })
    if (!ok) return

    setBusyId(row.id)
    try {
      const r = await definirAtivoFuncionarioAction(row.id, !row.ativo)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      setRows((cur) => cur.map((x) => (x.id === row.id ? { ...x, ativo: r.data.ativo } : x)))
      emitToast({
        kind: 'success',
        message: r.data.ativo ? L.toastAtivado : L.toastDesativado,
      })
    } finally {
      setBusyId(null)
    }
  }

  const columns: EntityColumn<FuncionarioListRow>[] = [
    {
      key: 'nome',
      header: L.colNome,
      cell: (r) => <span className="font-medium text-fg">{r.nome}</span>,
    },
    {
      key: 'email',
      header: L.colEmail,
      cell: (r) => <span className="text-fg-muted">{r.email ?? '—'}</span>,
    },
    {
      key: 'perfil',
      header: L.colPerfil,
      cell: (r) => labelPerfil(r.perfil, L),
    },
    {
      key: 'idioma',
      header: L.colIdioma,
      cell: (r) => <span className="uppercase">{r.idioma_preferido}</span>,
    },
    {
      key: 'status',
      header: L.colStatus,
      status: (r) => ({
        status: r.ativo ? 'ATIVO' : 'INATIVO',
        label: r.ativo ? L.ativo : L.inativo,
      }),
    },
  ]

  return (
    <>
      <CrudListShell
        title={L.listaTitulo}
        meta={
          <span className="text-caption text-fg-subtle">
            {filtrados.length} {L.contagem}
          </span>
        }
        toolbar={
          <PageActions>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEmEdicao(null)
                setModalAberto(true)
              }}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {L.novo}
            </Button>
          </PageActions>
        }
      >
        <EntityTable
          data={filtrados}
          columns={columns}
          rowKey={(r) => r.id}
          compact
          emptyState={
            <EmptyState
              icon={<Users className="h-6 w-6" aria-hidden />}
              title={L.vazio}
            />
          }
          rowActions={(row) => {
            const podeEditar = podeEditarAlvo(ator, row)
            const podeToggle = podeDesativarAlvo(ator, row)
            return (
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!podeEditar}
                  title={L.editar}
                  aria-label={L.editar}
                  onClick={() => {
                    setEmEdicao(row)
                    setModalAberto(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!podeToggle || busyId === row.id}
                  title={row.ativo ? L.desativar : L.ativar}
                  aria-label={row.ativo ? L.desativar : L.ativar}
                  onClick={() => void toggleAtivo(row)}
                >
                  {row.ativo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                </Button>
              </div>
            )
          }}
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
