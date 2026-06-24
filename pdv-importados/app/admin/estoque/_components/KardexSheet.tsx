'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { obterKardexProduto, type KardexMovimento } from '../actions'

export type KardexAlvo = Readonly<{ produtoId: string; produtoNome: string }>

type KardexLabels = {
  titulo: string
  semMovimentos: string
  semMovimentosSub: string
  tipoMap: Record<string, string>
}

/**
 * Formata data no padrão Bling: dd/mm/aaaa hh:mm:ss
 */
const dtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export function KardexSheet({
  alvo,
  onClose,
  labels,
}: {
  alvo: KardexAlvo | null
  onClose: () => void
  labels: KardexLabels
}) {
  const [movimentos, setMovimentos] = useState<KardexMovimento[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!alvo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [alvo, onClose])

  useEffect(() => {
    if (!alvo) return
    let vivo = true
    setCarregando(true)
    setMovimentos([])
    obterKardexProduto(alvo.produtoId)
      .then((rows) => {
        if (vivo) setMovimentos(rows)
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [alvo])

  if (!alvo) return null

  const rotuloTipo = (codigo: string): string =>
    labels.tipoMap[codigo] ?? codigo.replace(/_/g, ' ').toLowerCase()

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="kardex-titulo">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside className="admin-v2-sheet relative z-10 flex h-full w-full max-w-lg flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="kardex-titulo" className="text-[15px] font-semibold text-jl-fg-1">
              {labels.titulo}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-jl-fg-2">{alvo.produtoNome}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Tab "Lançamentos" estilo Bling — aba com underline verde */}
        <div className="border-b border-[var(--admin-v2-border)] px-5">
          <div className="flex items-center">
            <span className="border-b-2 border-emerald-500 pb-2 pt-3 text-[13px] font-semibold text-emerald-400">
              Lançamentos
            </span>
          </div>
        </div>

        {/* Conteúdo — tabela estilo Bling: Data | Tipo | Entrada | Saída */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {carregando ? (
            <div className="flex flex-col gap-px">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 bg-[rgba(255,255,255,0.02)] animate-pulse" />
              ))}
            </div>
          ) : movimentos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-3xl text-jl-fg-3" aria-hidden>🗒️</span>
              <p className="text-[13px] font-medium text-jl-fg-2">{labels.semMovimentos}</p>
              <p className="text-[11px] text-jl-fg-3">{labels.semMovimentosSub}</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              {/* Cabeçalho idêntico ao Bling: Data | Tipo | Entrada | Saída */}
              <thead className="sticky top-0 z-10 bg-[var(--color-background-secondary)]">
                <tr className="border-b border-[var(--admin-v2-border)]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3">
                    Data
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3">
                    Tipo
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-400">
                    Entrada
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-red-400">
                    Saída
                  </th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((mov) => {
                  const isEntrada = mov.quantidade_delta >= 0
                  const qtd = Math.abs(mov.quantidade_delta)
                  return (
                    <tr
                      key={mov.id}
                      className="border-t border-[var(--admin-v2-border)] transition-colors hover:bg-white/[0.02]"
                    >
                      {/* Data — formato Bling dd/mm/aaaa hh:mm:ss */}
                      <td className="px-4 py-2.5 text-left">
                        <span className="font-mono text-[11px] text-jl-fg-3">
                          {dtFmt.format(new Date(mov.created_at))}
                        </span>
                      </td>

                      {/* Tipo de movimento */}
                      <td className="px-4 py-2.5 text-left">
                        <span className="text-[12px] text-jl-fg-2">{rotuloTipo(mov.tipo_codigo)}</span>
                        {mov.observacao ? (
                          <p className="max-w-[140px] truncate text-[10px] text-jl-fg-3">{mov.observacao}</p>
                        ) : null}
                      </td>

                      {/* Entrada — quantidade positiva em verde */}
                      <td className="px-4 py-2.5 text-right">
                        {isEntrada ? (
                          <span className={cn('text-[12px] font-semibold tabular-nums text-emerald-400')}>
                            {qtd}
                          </span>
                        ) : (
                          <span className="text-[12px] text-jl-fg-3">—</span>
                        )}
                      </td>

                      {/* Saída — quantidade negativa em vermelho */}
                      <td className="px-4 py-2.5 text-right">
                        {!isEntrada ? (
                          <span className={cn('text-[12px] font-semibold tabular-nums text-red-400')}>
                            {qtd}
                          </span>
                        ) : (
                          <span className="text-[12px] text-jl-fg-3">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  )
}
