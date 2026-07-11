'use client'

import { useState, useEffect } from 'react'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { criarFuncionario, atualizarFuncionario, type FuncionarioRow } from './actions'
import { listarFuncionarios } from './actions'

interface Props {
  funcionarioId?: string | null
  onClose: () => void
  onSuccess: () => void
  locale: string
}

type Tab = 'dados' | 'acesso' | 'comissao' | 'historico'

export function FuncionariosFormModal({ funcionarioId, onClose, onSuccess, locale }: Props) {
  const [tab, setTab] = useState<Tab>('dados')
  const [loading, setLoading] = useState(false)
  const [funcionario, setFuncionario] = useState<FuncionarioRow | null>(null)

  // Form state
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [comissaoPadrao, setComissaoPadrao] = useState(5)

  // Load existing funcionario if editing
  useEffect(() => {
    if (funcionarioId) {
      setLoading(true)
      listarFuncionarios().then((r) => {
        if (r.success) {
          const found = r.data.find((f) => f.id === funcionarioId)
          if (found) {
            setFuncionario(found)
            setNome(found.nome)
            setCpf(found.cpf || '')
            setTelefone(found.telefone || '')
            setEmail(found.email || '')
            setAtivo(found.ativo)
            setComissaoPadrao(found.comissao_padrao_percentual)
          }
        }
        setLoading(false)
      })
    }
  }, [funcionarioId])

  const { mutate: salvar, loading: salvando } = useGerenteMutation(
    async () => {
      if (!nome.trim()) throw new Error('Nome é obrigatório.')
      if (comissaoPadrao < 0 || comissaoPadrao > 100) throw new Error('Comissão deve estar entre 0 e 100%.')

      const input = {
        nome: nome.trim(),
        cpf: cpf.trim() || null,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        ativo,
        comissao_padrao_percentual: comissaoPadrao,
      }

      if (funcionarioId) {
        const r = await atualizarFuncionario({ id: funcionarioId, ...input })
        if (!r.success) throw new Error(r.error)
      } else {
        const r = await criarFuncionario(input)
        if (!r.success) throw new Error(r.error)
      }

      return null
    },
    { successMessage: funcionarioId ? 'Funcionário atualizado.' : 'Funcionário criado.' },
  )

  const isEditing = !!funcionarioId

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto dragon-glass-backdrop px-4 py-12"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="dragon-elev-2 w-full max-w-2xl rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-jl-fg-1">
              {isEditing ? `Editar ${nome || 'Funcionário'}` : 'Novo Funcionário'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-jl-fg-3 hover:text-jl-fg-1 transition-colors"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* ── TABS ──────────────────────────────────────────────────────────── */}
        <div className="border-b border-jl-border-1 bg-jl-surface-elev px-5">
          <div className="flex gap-6">
            {(['dados', 'acesso', 'comissao', 'historico'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-jl-fg-3 hover:text-jl-fg-2'
                }`}
              >
                {t === 'dados' && 'Dados Básicos'}
                {t === 'acesso' && 'Acesso'}
                {t === 'comissao' && 'Comissão'}
                {t === 'historico' && 'Histórico'}
              </button>
            ))}
          </div>
        </div>

        {/* ── CONTENT ────────────────────────────────────────────────────────── */}
        <div className="px-5 py-4">
          {loading ? (
            <p className="text-sm app-muted">Carregando…</p>
          ) : tab === 'dados' ? (
            <DadosBasicosTab
              nome={nome}
              setNome={setNome}
              cpf={cpf}
              setCpf={setCpf}
              telefone={telefone}
              setTelefone={setTelefone}
              email={email}
              setEmail={setEmail}
              ativo={ativo}
              setAtivo={setAtivo}
            />
          ) : tab === 'acesso' ? (
            <AcessoTab funcionario={funcionario} />
          ) : tab === 'comissao' ? (
            <ComissaoTab
              comissaoPadrao={comissaoPadrao}
              setComissaoPadrao={setComissaoPadrao}
              funcionarioId={funcionarioId}
            />
          ) : (
            <HistoricoTab funcionarioId={funcionarioId} locale={locale} />
          )}
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <div className="border-t border-jl-border-1 bg-jl-surface-elev px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors app-border app-btn-neutral"
          >
            Cancelar
          </button>
          {tab !== 'historico' && (
            <button
              type="button"
              onClick={() => void salvar(null)}
              disabled={salvando}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors app-btn-accent disabled:opacity-60"
            >
              {salvando ? '…' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Components
// ─────────────────────────────────────────────────────────────────────────────

function DadosBasicosTab({
  nome,
  setNome,
  cpf,
  setCpf,
  telefone,
  setTelefone,
  email,
  setEmail,
  ativo,
  setAtivo,
}: {
  nome: string
  setNome: (v: string) => void
  cpf: string
  setCpf: (v: string) => void
  telefone: string
  setTelefone: (v: string) => void
  email: string
  setEmail: (v: string) => void
  ativo: boolean
  setAtivo: (v: boolean) => void
}) {
  const inputClass =
    'w-full rounded-lg border border-jl-border-1 bg-[#0a0f1e] px-3 py-2 text-sm text-jl-fg-1 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-jl-fg-1 mb-1">Nome completo *</label>
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-jl-fg-1 mb-1">CPF (opcional)</label>
          <input type="text" value={cpf} onChange={(e) => setCpf(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-jl-fg-1 mb-1">Telefone (opcional)</label>
          <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-jl-fg-1 mb-1">Email (opcional)</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="ativo-toggle"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          className="rounded border-jl-border-1"
        />
        <label htmlFor="ativo-toggle" className="text-sm font-medium text-jl-fg-1">
          Ativo
        </label>
      </div>
    </div>
  )
}

function AcessoTab({ funcionario }: { funcionario: FuncionarioRow | null }) {
  return (
    <div className="space-y-4">
      {funcionario?.usuario_nome ? (
        <div className="rounded-lg border border-jl-border-1 bg-jl-surface-elev p-3">
          <p className="text-sm text-jl-fg-3">Associado a:</p>
          <p className="text-base font-medium text-jl-fg-1">{funcionario.usuario_nome}</p>
          <p className="text-xs text-jl-fg-2 mt-1">Perfil: {funcionario.usuario_perfil}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-jl-border-1 bg-jl-surface-elev p-3">
          <p className="text-sm text-jl-fg-2">Sem acesso ao sistema</p>
          <p className="text-xs text-jl-fg-3 mt-1">Este funcionário não está associado a nenhuma conta de usuário</p>
        </div>
      )}
      <p className="text-xs text-jl-fg-3">
        Para alterar permissões, edite a conta de usuário associada na seção de Usuários.
      </p>
    </div>
  )
}

function ComissaoTab({
  comissaoPadrao,
  setComissaoPadrao,
  funcionarioId,
}: {
  comissaoPadrao: number
  setComissaoPadrao: (v: number) => void
  funcionarioId?: string | null
}) {
  const inputClass =
    'w-full rounded-lg border border-jl-border-1 bg-[#0a0f1e] px-3 py-2 text-sm text-jl-fg-1 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-jl-fg-1 mb-2">Comissão Padrão</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={comissaoPadrao}
            onChange={(e) => setComissaoPadrao(parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
          <span className="text-jl-fg-1 font-medium">%</span>
        </div>
        <p className="text-xs text-jl-fg-3 mt-1">
          Taxa padrão aplicada quando nenhuma regra específica se aplica.
        </p>
      </div>

      {funcionarioId && (
        <div className="mt-6 pt-4 border-t border-jl-border-1">
          <p className="text-sm font-medium text-jl-fg-1 mb-3">Regras Específicas</p>
          <p className="text-xs text-jl-fg-3 mb-3">
            Configure regras de comissão para produtos específicos, categorias, ou margens.
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            + Adicionar Regra
          </button>
          <p className="text-xs text-jl-fg-3 mt-2">
            (Funcionalidade disponível após salvar o funcionário)
          </p>
        </div>
      )}
    </div>
  )
}

function HistoricoTab({ funcionarioId, locale }: { funcionarioId?: string | null; locale: string }) {
  const [historico, setHistorico] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (funcionarioId) {
      // Load historico when tab opens
      setLoading(true)
      // Will be implemented with carregarComissaoHistorico action
      setLoading(false)
    }
  }, [funcionarioId])

  if (!funcionarioId) {
    return <p className="text-sm app-muted">Salve o funcionário para ver o histórico.</p>
  }

  if (loading) {
    return <p className="text-sm app-muted">Carregando…</p>
  }

  if (historico.length === 0) {
    return <p className="text-sm app-muted">Nenhuma alteração registrada.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-jl-border-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-jl-border-1 bg-jl-surface-elev text-jl-fg-3">
            <th className="px-3 py-2 text-left font-medium">Data</th>
            <th className="px-3 py-2 text-left font-medium">Ação</th>
            <th className="px-3 py-2 text-left font-medium">Valores</th>
            <th className="px-3 py-2 text-left font-medium">Alterado por</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-jl-border-1">
          {historico.map((h) => (
            <tr key={h.id} className="gerente-fin-row-hover">
              <td className="gerente-fin-cell px-3 py-2">
                {new Date(h.alterado_em).toLocaleDateString(locale)}
              </td>
              <td className="gerente-fin-cell px-3 py-2 capitalize">{h.acao}</td>
              <td className="gerente-fin-cell px-3 py-2 text-xs">
                {h.dados_anteriores && `${JSON.stringify(h.dados_anteriores).slice(0, 30)}...`}
              </td>
              <td className="gerente-fin-cell px-3 py-2">{h.alterado_por_nome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
