'use client'

import { useEffect, useState } from 'react'
import { carregarComissaoHistorico, type ComissaoHistoricoRow } from './actions'

interface Props {
  funcionarioId: string
  onClose: () => void
  locale: string
}

export function ComissaoHistoricoModal({ funcionarioId, onClose, locale }: Props) {
  const [historico, setHistorico] = useState<ComissaoHistoricoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    carregarComissaoHistorico(funcionarioId).then((r) => {
      setLoading(false)
      if (r.success) {
        setHistorico(r.data)
      } else {
        setError(r.error)
      }
    })
  }, [funcionarioId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto dragon-glass-backdrop px-4 py-12"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="dragon-elev-2 w-full max-w-3xl rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-jl-fg-1">Histórico de Comissões</h2>
            <p className="text-xs app-muted mt-1">Registro completo de alterações de regras de comissão</p>
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

        <div className="px-5 py-4">
          {loading ? (
            <p className="text-sm app-muted">Carregando…</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : historico.length === 0 ? (
            <p className="text-sm app-muted">Nenhuma alteração registrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-jl-border-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-jl-border-1 bg-jl-surface-elev text-jl-fg-3">
                    <th className="px-3 py-2 text-left font-medium">Data/Hora</th>
                    <th className="px-3 py-2 text-left font-medium">Ação</th>
                    <th className="px-3 py-2 text-left font-medium">Detalhes</th>
                    <th className="px-3 py-2 text-left font-medium">Alterado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-jl-border-1">
                  {historico.map((h) => (
                    <tr key={h.id} className="gerente-fin-row-hover">
                      <td className="gerente-fin-cell px-3 py-2 tabular-nums">
                        {new Date(h.alterado_em).toLocaleString(locale)}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            h.acao === 'criada'
                              ? 'app-badge-positive'
                              : h.acao === 'alterada'
                                ? 'app-badge-warn'
                                : 'app-badge-danger'
                          }`}
                        >
                          {h.acao === 'criada' && 'Criada'}
                          {h.acao === 'alterada' && 'Alterada'}
                          {h.acao === 'desativada' && 'Desativada'}
                        </span>
                      </td>
                      <td className="gerente-fin-cell px-3 py-2 text-[10px] max-w-xs truncate">
                        {h.dados_anteriores && h.acao === 'alterada' ? (
                          <div className="flex gap-1 items-center">
                            <span className="text-jl-fg-3">
                              {formatarComissao(h.dados_anteriores)}
                            </span>
                            <span className="text-jl-fg-3">→</span>
                            <span className="font-semibold">
                              {formatarComissao(h.dados_novos)}
                            </span>
                          </div>
                        ) : (
                          <span>{formatarComissao(h.dados_novos)}</span>
                        )}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2">{h.alterado_por_nome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-jl-border-1 bg-jl-surface-elev px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors app-border app-btn-neutral"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function formatarComissao(dados: Record<string, unknown>): string {
  if (!dados) return '—'
  if (dados.tipo_regra === 'padrao') {
    return `Padrão: ${dados.percentual}%`
  }
  if (dados.tipo_regra === 'por_produto') {
    return `Produto: ${dados.percentual}%`
  }
  if (dados.tipo_regra === 'por_categoria') {
    return `Categoria: ${dados.percentual}%`
  }
  if (dados.tipo_regra === 'por_margem') {
    return `Margem ${dados.margem_minima}%-${dados.margem_maxima}%: ${dados.percentual}%`
  }
  return JSON.stringify(dados).slice(0, 40) + '...'
}
