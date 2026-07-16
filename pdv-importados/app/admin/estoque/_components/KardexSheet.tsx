'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { obterKardexProduto, type KardexMovimento } from '../actions'

export type KardexAlvo = Readonly<{ produtoId: string; produtoNome: string }>

type KardexLabels = {
  titulo: string
  semMovimentos: string
  semMovimentosSub: string
  erroCarregar: string
  tentarNovamente: string
  tipoMap: Record<string, string>
}

function isFocusable(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && !el.hasAttribute('disabled') && el.tabIndex !== -1
}

const dtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
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
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const panelRef = useRef<HTMLElement>(null)

  // Escape + trava de scroll + ciclo de Tab contido no painel (mesma técnica
  // do DragonModal — este sheet lateral não reusa o componente porque é um
  // padrão de UI diferente — drawer, não diálogo centralizado — mas precisa
  // do mesmo comportamento de foco para não vazar Tab para trás do overlay).
  useEffect(() => {
    if (!alvo) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
          ),
        ).filter(isFocusable)
        if (focusables.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        const activeDentro = active instanceof HTMLElement && focusables.includes(active)
        if (e.shiftKey && (active === first || !activeDentro)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !activeDentro)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (panel && !panel.contains(document.activeElement)) panel.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
      previouslyFocused?.focus?.()
    }
  }, [alvo, onClose])

  useEffect(() => {
    if (!alvo) return
    let vivo = true
    setCarregando(true)
    setErro(null)
    setMovimentos([])
    obterKardexProduto(alvo.produtoId)
      .then((res) => {
        if (!vivo) return
        if (res.ok) {
          setMovimentos(res.rows)
        } else {
          setErro(res.error)
        }
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [alvo, tentativa])

  if (!alvo) return null

  const rotuloTipo = (codigo: string): string =>
    labels.tipoMap[codigo] ?? codigo.replace(/_/g, ' ').toLowerCase()

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="kardex-titulo">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside ref={panelRef} tabIndex={-1} className="admin-v2-sheet relative z-10 flex h-full w-full max-w-md flex-col outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-secondary)] px-5 py-4">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {carregando ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-jl-surface-soft opacity-60" />
              ))}
            </div>
          ) : erro ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="admin-v2-alert-danger flex h-9 w-9 items-center justify-center rounded-lg" aria-hidden>
                <AlertTriangle size={16} />
              </span>
              <p className="text-[13px] font-medium text-jl-fg-2">{labels.erroCarregar}</p>
              <p className="text-[11px] text-jl-fg-3">{erro}</p>
              <button
                type="button"
                onClick={() => setTentativa((n) => n + 1)}
                className="admin-v2-btn-secondary mt-2"
              >
                {labels.tentarNovamente}
              </button>
            </div>
          ) : movimentos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-3xl text-jl-fg-3" aria-hidden>
                🗒️
              </span>
              <p className="text-[13px] font-medium text-jl-fg-2">{labels.semMovimentos}</p>
              <p className="text-[11px] text-jl-fg-3">{labels.semMovimentosSub}</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {movimentos.map((m) => {
                const entrada = m.quantidade_delta >= 0
                return (
                  <li
                    key={m.id}
                    className="flex items-start gap-3 border-t border-[var(--color-border-secondary)] py-2.5"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        entrada ? 'admin-v2-alert-success' : 'admin-v2-alert-danger',
                      )}
                    >
                      {entrada ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium text-jl-fg-1">
                          {rotuloTipo(m.tipo_codigo)}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[12px] font-semibold tabular-nums',
                            entrada ? 'text-emerald-400' : 'text-red-400',
                          )}
                        >
                          {entrada ? '+' : '−'}
                          {Math.abs(m.quantidade_delta)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[10px] text-jl-fg-3">
                          {dtFmt.format(new Date(m.created_at))}
                        </span>
                      </div>
                      {m.observacao ? (
                        <p className="mt-0.5 text-[11px] text-jl-fg-2">{m.observacao}</p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
