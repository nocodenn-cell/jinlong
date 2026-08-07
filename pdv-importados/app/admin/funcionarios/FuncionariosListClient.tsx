'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, UserX, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTablePage } from '@/components/gerente/DataTablePage'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { emitToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import {
  definirAtivoFuncionarioAction,
  type FuncionarioListRow,
} from './actions'
import { FuncionarioEditarModal, type FuncionarioModalLabels } from './FuncionarioEditarModal'
import { podeDesativarAlvo, podeEditarAlvo } from './funcionarioPolicies'

export type FuncionariosListLabels = {
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

export function FuncionariosListClient({ atorId, atorPerfil, iniciais, labels: L }: Props) {
  const [rows, setRows] = useState(iniciais)
  const [termo, setTermo] = useState('')
  const [statusF, setStatusF] = useState<'todos' | 'ativos' | 'inativos'>('todos')
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
        r.perfil.toLowerCase().includes(q)
      )
    })
  }, [rows, termo, statusF])

  const ator = { id: atorId, perfil: atorPerfil }

  async function toggleAtivo(row: FuncionarioListRow) {
    if (!podeDesativarAlvo(ator, row)) {
      emitToast({
        kind: 'error',
        message: row.ativo ? 'Não é possível desativar esta conta.' : 'Não é possível reativar esta conta.',
      })
      return
    }
    setBusyId(row.id)
    try {
      const r = await definirAtivoFuncionarioAction(row.id, !row.ativo)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      setRows((cur) => cur.map((x) => (x.id === row.id ? { ...x, ativo: r.data.ativo } : x)))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <DataTablePage
        meta={`${filtrados.length} ${L.contagem}`}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder={L.buscaPlaceholder}
              className="min-w-[220px] flex-1 rounded-md border border-jl-border-1 bg-jl-surface-soft px-3 py-2 text-sm"
            />
            <select
              value={statusF}
              onChange={(e) => setStatusF(e.target.value as typeof statusF)}
              className="rounded-md border border-jl-border-1 bg-jl-surface-soft px-3 py-2 text-sm"
            >
              <option value="todos">{L.filtroTodos}</option>
              <option value="ativos">{L.filtroAtivos}</option>
              <option value="inativos">{L.filtroInativos}</option>
            </select>
          </div>
        }
        actions={
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
        }
      >
        <GerenteTable
          tone="dragon"
          compact
          columns={[
            { key: 'nome', header: L.colNome, priority: 'primary' },
            { key: 'email', header: L.colEmail },
            { key: 'perfil', header: L.colPerfil },
            { key: 'idioma', header: L.colIdioma, width: 80 },
            { key: 'status', header: L.colStatus, width: 100 },
            {
              key: 'acoes',
              header: <span className="sr-only">{L.colAcoes}</span>,
              width: 100,
              priority: 'contextual',
            },
          ]}
        >
          {filtrados.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-sm text-jl-fg-3">
                {L.vazio}
              </td>
            </tr>
          ) : (
            filtrados.map((row) => {
              const podeEditar = podeEditarAlvo(ator, row)
              const podeToggle = podeDesativarAlvo(ator, row)
              return (
                <tr
                  key={row.id}
                  className={cn('gerente-fin-row-hover transition-colors', !row.ativo && 'opacity-60')}
                >
                  <td className="px-3 py-2 text-sm font-medium text-jl-fg-1">{row.nome}</td>
                  <td className="px-3 py-2 text-sm text-jl-fg-2">{row.email ?? '—'}</td>
                  <td className="px-3 py-2 text-sm">{labelPerfil(row.perfil, L)}</td>
                  <td className="px-3 py-2 text-sm uppercase">{row.idioma_preferido}</td>
                  <td className="px-3 py-2 text-sm">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        row.ativo
                          ? 'bg-emerald-500/15 text-emerald-700'
                          : 'bg-jl-surface-soft text-jl-fg-3',
                      )}
                    >
                      {row.ativo ? L.ativo : L.inativo}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
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
                  </td>
                </tr>
              )
            })
          )}
        </GerenteTable>
      </DataTablePage>

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
