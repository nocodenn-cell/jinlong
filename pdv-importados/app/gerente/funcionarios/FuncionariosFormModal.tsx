'use client'

import { useState, useEffect } from 'react'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import {
  criarFuncionario,
  atualizarFuncionario,
  listarFuncionarios,
  listarComissoesRegras,
  type FuncionarioRow,
  type ComissaoRegraRow,
} from './actions'
import { ComissaoRulesEditor } from './ComissaoRulesEditor'
import { ComissaoHistoricoList } from './ComissaoHistoricoList'

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
    {
      successMessage: funcionarioId ? 'Funcionário atualizado.' : 'Funcionário criado.',
      onSuccess: () => onSuccess(),
    },
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

const TIPO_LABEL: Record<ComissaoRegraRow['tipo_regra'], string> = {
  por_produto: 'Produto',
  por_categoria: 'Categoria',
  por_margem: 'Margem',
  padrao: 'Padrão',
}

// Ordem de prioridade usada pelo motor de comissão: produto > categoria > margem > padrão.
const PRIORIDADE_ORDEM: Record<ComissaoRegraRow['tipo_regra'], number> = {
  por_produto: 1,
  por_categoria: 2,
  por_margem: 3,
  padrao: 4,
}

function alvoDaRegra(r: ComissaoRegraRow): string {
  if (r.tipo_regra === 'por_produto') return r.produto_nome ?? '—'
  if (r.tipo_regra === 'por_categoria') return r.categoria_nome ?? '—'
  if (r.tipo_regra === 'por_margem') return `${r.margem_minima}% – ${r.margem_maxima}%`
  return '—'
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

  const [regras, setRegras] = useState<ComissaoRegraRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [regraEditando, setRegraEditando] = useState<ComissaoRegraRow | null>(null)

  const carregarRegras = () => {
    if (!funcionarioId) return
    setLoading(true)
    listarComissoesRegras(funcionarioId).then((r) => {
      setLoading(false)
      if (r.success) {
        // Prioridade produto > categoria > margem (a regra "padrao" já tem seção própria acima)
        setRegras(
          r.data
            .filter((x) => x.tipo_regra !== 'padrao')
            .sort((a, b) => PRIORIDADE_ORDEM[a.tipo_regra] - PRIORIDADE_ORDEM[b.tipo_regra]),
        )
      }
    })
  }

  useEffect(() => {
    carregarRegras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarioId])

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
          Taxa aplicada quando nenhuma regra específica abaixo se aplica (menor prioridade).
        </p>
      </div>

      {funcionarioId ? (
        <div className="mt-6 pt-4 border-t border-jl-border-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-jl-fg-1">Regras Específicas</p>
              <p className="text-xs text-jl-fg-3">
                Ordem de prioridade: Produto → Categoria → Margem → Padrão.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRegraEditando(null)
                setEditorOpen(true)
              }}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors shrink-0"
            >
              + Nova Regra
            </button>
          </div>

          {loading ? (
            <p className="text-sm app-muted">Carregando…</p>
          ) : regras.length === 0 ? (
            <p className="text-sm app-muted">Nenhuma regra específica cadastrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-jl-border-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-jl-border-1 bg-jl-surface-elev text-jl-fg-3">
                    <th className="px-3 py-2 text-left font-medium">Prioridade</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Alvo</th>
                    <th className="px-3 py-2 text-right font-medium">Comissão</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-jl-border-1">
                  {regras.map((r) => (
                    <tr key={r.id} className="gerente-fin-row-hover">
                      <td className="gerente-fin-cell px-3 py-2 tabular-nums">
                        {PRIORIDADE_ORDEM[r.tipo_regra]}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2">{TIPO_LABEL[r.tipo_regra]}</td>
                      <td className="gerente-fin-cell px-3 py-2">{alvoDaRegra(r)}</td>
                      <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums font-semibold">
                        {r.percentual}%
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            r.ativo ? 'app-badge-positive' : 'app-badge-warn'
                          }`}
                        >
                          {r.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setRegraEditando(r)
                            setEditorOpen(true)
                          }}
                          className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-jl-fg-3 mt-2">
          Salve o funcionário para configurar regras específicas de produto, categoria ou margem.
        </p>
      )}

      {editorOpen && funcionarioId && (
        <ComissaoRulesEditor
          funcionarioId={funcionarioId}
          regraExistente={regraEditando}
          onClose={() => setEditorOpen(false)}
          onSuccess={() => {
            setEditorOpen(false)
            carregarRegras()
          }}
        />
      )}
    </div>
  )
}

function HistoricoTab({ funcionarioId, locale }: { funcionarioId?: string | null; locale: string }) {
  if (!funcionarioId) {
    return <p className="text-sm app-muted">Salve o funcionário para ver o histórico.</p>
  }

  return <ComissaoHistoricoList funcionarioId={funcionarioId} locale={locale} />
}
