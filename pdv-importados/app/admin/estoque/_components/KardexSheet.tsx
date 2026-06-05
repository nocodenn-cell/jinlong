'use client'

/**
 * FastProduct Admin — KardexSheet (Fase 5)
 *
 * Painel lateral (sheet) com o histórico de movimentações do produto. Carrega
 * sob demanda ao abrir via a action read-only `obterKardexProduto`. Entradas em
 * verde (+), saídas em vermelho (−). Visual zinc-950 do painel /admin.
 */

import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react'
import { obterKardexProduto, type KardexMovimento } from '../actions'

export type KardexAlvo = Readonly<{ produtoId: string; produtoNome: string }>

const TIPO_LABEL: Record<string, string> = {
  VENDA: 'Venda',
  COMPRA: 'Compra',
  ENTRADA_NF: 'Entrada NF-e',
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste manual',
  ACERTO_INVENTARIO: 'Acerto de inventário',
  PERDA: 'Perda',
  QUEBRA: 'Quebra / avaria',
  DEVOLUCAO: 'Devolução',
  TRANSFERENCIA: 'Transferência',
  OUTRO: 'Outro',
}

function rotuloTipo(codigo: string): string {
  return TIPO_LABEL[codigo] ?? codigo.replace(/_/g, ' ').toLowerCase()
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
}: {
  alvo: KardexAlvo | null
  onClose: () => void
}) {
  const [movimentos, setMovimentos] = useState<KardexMovimento[]>([])
  const [carregando, setCarregando] = useState(false)

  // Trava scroll + fecha no Escape enquanto aberto.
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

  // Carrega ao abrir; cancela escrita se fechar/trocar antes de resolver.
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="kardex-titulo">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-md flex-col"
        style={{ background: 'var(--fp-bg-card)', borderLeft: '1px solid var(--fp-border)' }}
      >
        <div
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--fp-border)' }}
        >
          <div className="min-w-0">
            <h2 id="kardex-titulo" className="text-[15px] font-semibold" style={{ color: 'var(--fp-text-primary)' }}>
              Kardex
            </h2>
            <p className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--fp-text-secondary)' }}>
              {alvo.produtoNome}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--fp-text-muted)' }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {carregando ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-lg"
                  style={{ background: 'var(--fp-bg-secondary)', opacity: 0.6 }}
                />
              ))}
            </div>
          ) : movimentos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-3xl" aria-hidden style={{ color: 'var(--fp-text-muted)' }}>
                🗒️
              </span>
              <p className="text-[13px] font-medium" style={{ color: 'var(--fp-text-secondary)' }}>
                Sem movimentações registradas
              </p>
              <p className="text-[11px]" style={{ color: 'var(--fp-text-muted)' }}>
                As entradas e saídas deste produto aparecerão aqui.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {movimentos.map((m) => {
                const entrada = m.quantidade_delta >= 0
                return (
                  <li
                    key={m.id}
                    className="flex items-start gap-3 py-2.5"
                    style={{ borderTop: '1px solid var(--fp-border-subtle)' }}
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: entrada ? 'var(--fp-success-bg)' : 'var(--fp-danger-bg)',
                        color: entrada ? 'var(--fp-success)' : 'var(--fp-danger)',
                      }}
                    >
                      {entrada ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium" style={{ color: 'var(--fp-text-primary)' }}>
                          {rotuloTipo(m.tipo_codigo)}
                        </span>
                        <span
                          className="shrink-0 text-[12px] font-semibold tabular-nums"
                          style={{ color: entrada ? 'var(--fp-success)' : 'var(--fp-danger)' }}
                        >
                          {entrada ? '+' : '−'}
                          {Math.abs(m.quantidade_delta)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[10px]" style={{ color: 'var(--fp-text-muted)' }}>
                          {dtFmt.format(new Date(m.created_at))}
                        </span>
                      </div>
                      {m.observacao ? (
                        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--fp-text-secondary)' }}>
                          {m.observacao}
                        </p>
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
