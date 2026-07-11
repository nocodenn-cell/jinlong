'use client'

import { useCallback, useState } from 'react'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { formatBRL } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { FuncionarioRow } from './actions'
import { listarFuncionarios, alternarAtivoFuncionario } from './actions'
import { FuncionariosFormModal } from './FuncionariosFormModal'
import { ComissaoHistoricoModal } from './ComissaoHistoricoModal'

type Props = Readonly<{ idioma: Idioma }>

const filterClass =
  'h-8 rounded-lg border border-jl-border-1 bg-[#0a0f1e] px-3 text-xs text-jl-fg-1 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30'

export function FuncionariosPageClient({ idioma }: Props) {
  const locale = localeFromIdioma(idioma)

  const [filtro, setFiltro] = useState<{ ativo?: boolean; perfil?: string }>({
    ativo: true,
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [historicoOpen, setHistoricoOpen] = useState(false)
  const [historicoFuncionarioId, setHistoricoFuncionarioId] = useState<string | null>(null)

  const queryFn = useCallback(async () => {
    const r = await listarFuncionarios(filtro)
    if (!r.success) throw new Error(r.error)
    return r.data
  }, [filtro])

  const { data: funcionarios, loading, refetch } = useGerenteQuery(queryFn)

  const { mutate: toggleAtivo } = useGerenteMutation(
    async (id: string) => {
      const current = funcionarios?.find((f) => f.id === id)
      if (!current) return null
      const r = await alternarAtivoFuncionario(id, !current.ativo)
      if (!r.success) throw new Error(r.error)
      await refetch()
      return null
    },
    { successMessage: 'Status atualizado.' },
  )

  const abrirHistorico = useCallback((funcionarioId: string) => {
    setHistoricoFuncionarioId(funcionarioId)
    setHistoricoOpen(true)
  }, [])

  return (
    <>
      {/* ── BARRA STICKY ──────────────────────────────────────────────────── */}
      <GerenteStickyToolbar className="py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-jl-fg-1 mr-2 shrink-0">Funcionários</h1>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-jl-fg-3 uppercase tracking-wide">Status</span>
            <select
              value={filtro.ativo === undefined ? 'todos' : filtro.ativo ? 'ativo' : 'inativo'}
              onChange={(e) => {
                if (e.target.value === 'todos') setFiltro({ ...filtro, ativo: undefined })
                else if (e.target.value === 'ativo') setFiltro({ ...filtro, ativo: true })
                else setFiltro({ ...filtro, ativo: false })
              }}
              className={filterClass}
            >
              <option value="todos">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setEditandoId(null)
              setFormOpen(true)
            }}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors app-btn-accent"
          >
            + Novo Funcionário
          </button>
        </div>
      </GerenteStickyToolbar>

      {/* ── CONTEÚDO ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        {loading ? (
          <p className="text-sm app-muted">Carregando…</p>
        ) : !funcionarios || funcionarios.length === 0 ? (
          <p className="text-sm app-muted">Nenhum funcionário cadastrado.</p>
        ) : (
          <GerenteTable
            tone="dragon"
            compact
            columns={[
              { key: 'nome', header: 'Nome', priority: 'primary' },
              { key: 'usuario', header: 'Usuário', priority: 'secondary' },
              { key: 'perfil', header: 'Perfil', priority: 'secondary' },
              { key: 'status', header: 'Status', align: 'center', width: 80 },
              { key: 'comissao', header: 'Comissão Padrão', numeric: true, priority: 'primary' },
              { key: 'acoes', header: '', align: 'right', width: 120, priority: 'contextual' },
            ]}
          >
            {funcionarios.map((row) => (
              <tr key={row.id} className="gerente-fin-row-hover transition-colors">
                <td className="gerente-fin-cell px-4 py-2 font-medium">{row.nome}</td>
                <td className="gerente-fin-cell px-4 py-2 text-sm text-jl-fg-2">
                  {row.usuario_nome || '—'}
                </td>
                <td className="gerente-fin-cell px-4 py-2 text-sm text-jl-fg-2">
                  {row.usuario_perfil || '—'}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => void toggleAtivo(row.id)}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                      row.ativo ? 'app-badge-positive' : 'app-badge-warn'
                    }`}
                  >
                    {row.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="gerente-fin-cell px-4 py-2 text-right tabular-nums font-medium">
                  {row.comissao_padrao_percentual}%
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="gerente-row-actions flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(row.id)
                        setFormOpen(true)
                      }}
                      className="rounded-md border px-2 py-1 text-xs font-medium transition-colors app-border app-btn-neutral"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirHistorico(row.id)}
                      className="rounded-md border px-2 py-1 text-xs font-medium transition-colors app-border app-btn-neutral"
                    >
                      Histórico
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </GerenteTable>
        )}
      </div>

      {/* ── MODAL DE FORMULÁRIO ────────────────────────────────────────────── */}
      {formOpen && (
        <FuncionariosFormModal
          funcionarioId={editandoId}
          onClose={() => {
            setFormOpen(false)
            setEditandoId(null)
          }}
          onSuccess={async () => {
            setFormOpen(false)
            setEditandoId(null)
            await refetch()
          }}
          locale={locale}
        />
      )}

      {/* ── MODAL DE HISTÓRICO ────────────────────────────────────────────── */}
      {historicoOpen && historicoFuncionarioId && (
        <ComissaoHistoricoModal
          funcionarioId={historicoFuncionarioId}
          onClose={() => {
            setHistoricoOpen(false)
            setHistoricoFuncionarioId(null)
          }}
          locale={locale}
        />
      )}
    </>
  )
}
