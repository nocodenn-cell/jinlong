'use client'

import { useState, useCallback, useEffect } from 'react'
import { Plus, FilterX } from 'lucide-react'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import { emitGerenteToast } from '@/lib/gerente/toast'
import {
  criarFuncionarioAction,
  listarFuncionariosPaginadoAction,
  atualizarFuncionarioAction,
  desativarFuncionarioAction,
  type FuncionarioRow,
  type CriarFuncionarioInput,
} from './actions'

type Props = Readonly<{
  idioma: Idioma
  funcionariosIniciais: FuncionarioRow[]
  hasMoreInicial: boolean
}>

export function FuncionariosListClient({ idioma, funcionariosIniciais, hasMoreInicial }: Props) {
  const m = getMessages(idioma)
  const c = m.comum

  const [funcionarios, setFuncionarios] = useState<FuncionarioRow[]>(funcionariosIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [page, setPage] = useState(1)
  const [termo, setTermo] = useState('')
  const [status, setStatus] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const carregar = useCallback(
    async (pag: number) => {
      setLoading(true)
      try {
        const res = await listarFuncionariosPaginadoAction(pag, { termo, status })
        if (res.ok) {
          setFuncionarios(res.funcionarios)
          setHasMore(res.hasMore)
          setPage(pag)
        } else {
          emitGerenteToast({ kind: 'error', message: res.error })
        }
      } catch (e) {
        emitGerenteToast({ kind: 'error', message: 'Erro ao carregar funcionários.' })
      } finally {
        setLoading(false)
      }
    },
    [termo, status],
  )

  useEffect(() => {
    void carregar(1)
  }, [termo, status, carregar])

  async function handleCriar(input: CriarFuncionarioInput) {
    const res = await criarFuncionarioAction(input)
    if (res.ok) {
      emitGerenteToast({ kind: 'success', message: 'Funcionário criado com sucesso!' })
      setModalOpen(false)
      void carregar(1)
    } else {
      emitGerenteToast({ kind: 'error', message: res.error })
    }
  }

  async function handleDesativar(id: string) {
    if (!confirm('Desativar este funcionário?')) return
    const res = await desativarFuncionarioAction(id)
    if (res.ok) {
      emitGerenteToast({ kind: 'success', message: 'Funcionário desativado.' })
      void carregar(page)
    } else {
      emitGerenteToast({ kind: 'error', message: res.error })
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-jl-fg-1">Funcionários</h1>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.05] p-3">
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="app-input h-9 rounded-md px-3 text-sm"
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="app-input h-9 rounded-md px-3 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>

        <button
          onClick={() => {
            setTermo('')
            setStatus('todos')
          }}
          className="inline-flex items-center gap-1 text-xs text-jl-fg-3 hover:text-jl-fg-1"
        >
          <FilterX className="h-3 w-3" />
          Limpar
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-3 py-2 text-xs font-medium text-black hover:bg-amber-300"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Funcionário
        </button>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg bg-white/[0.05]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left font-semibold text-jl-fg-2">Nome</th>
              <th className="px-4 py-3 text-left font-semibold text-jl-fg-2">E-mail</th>
              <th className="px-4 py-3 text-left font-semibold text-jl-fg-2">Cargo</th>
              <th className="px-4 py-3 text-center font-semibold text-jl-fg-2">Comissão</th>
              <th className="px-4 py-3 text-left font-semibold text-jl-fg-2">Data Admissão</th>
              <th className="px-4 py-3 text-center font-semibold text-jl-fg-2">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-jl-fg-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {funcionarios.map((f) => (
              <tr key={f.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-3 text-jl-fg-1">{f.nome_exibicao}</td>
                <td className="px-4 py-3 text-jl-fg-3">{f.email}</td>
                <td className="px-4 py-3 capitalize text-jl-fg-2">{f.cargo}</td>
                <td className="px-4 py-3 text-center text-jl-fg-2">
                  {f.comissao_percentual ? `${f.comissao_percentual}%` : '—'}
                </td>
                <td className="px-4 py-3 text-jl-fg-3">
                  {new Date(f.data_admissao).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      f.ativo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300',
                    )}
                  >
                    {f.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleDesativar(f.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                    disabled={!f.ativo}
                  >
                    Desativar
                  </button>
                </td>
              </tr>
            ))}
            {funcionarios.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="text-sm font-medium text-jl-fg-3">Nenhum funcionário encontrado.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <p className="mt-4 text-center text-sm opacity-60">{c.carregando}</p>
      )}

      {/* Paginação */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => void carregar(page + 1)}
            className="rounded-md bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/15"
          >
            Carregar mais
          </button>
        </div>
      )}

      {/* Modal criar */}
      {modalOpen && (
        <CriarFuncionarioModal
          onClose={() => setModalOpen(false)}
          onSave={handleCriar}
        />
      )}
    </>
  )
}

function CriarFuncionarioModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (input: CriarFuncionarioInput) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cargo, setCargo] = useState<'operador' | 'gerente' | 'supervisor' | 'outro'>('operador')
  const [comissao, setComissao] = useState('0')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        nome_exibicao: nome,
        email,
        cargo,
        comissao_percentual: parseFloat(comissao),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg bg-jl-bg-base p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-jl-fg-1">Novo Funcionário</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-jl-fg-2">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="app-input mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Pedro Silva"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-jl-fg-2">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="app-input mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="pedro@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-jl-fg-2">Cargo</label>
            <select
              value={cargo}
              onChange={(e) => setCargo(e.target.value as any)}
              className="app-input mt-1 w-full rounded-md px-3 py-2 text-sm"
            >
              <option value="operador">Operador</option>
              <option value="gerente">Gerente</option>
              <option value="supervisor">Supervisor</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-jl-fg-2">Comissão (%)</label>
            <input
              type="number"
              value={comissao}
              onChange={(e) => setComissao(e.target.value)}
              min="0"
              max="100"
              className="app-input mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="5"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-md bg-white/10 py-2 text-xs font-medium hover:bg-white/15"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-md bg-amber-400 py-2 text-xs font-medium text-black hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}
