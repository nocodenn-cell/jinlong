'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Package,
  Percent,
  ShoppingCart,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'
import type { Mensagens } from '@/i18n/getMessages'
import type { AuditoriaEvento, AuditoriaTipo } from '../actions'

type AuditoriaLabels = Mensagens['admin_ui']

const dtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

type TipoVisual = {
  icon: LucideIcon
  /** Classe do badge/ícone (reusa tokens admin-v2 / tailwind já presentes). */
  chipClass: string
  iconClass: string
}

const TIPO_VISUAL: Record<AuditoriaTipo, TipoVisual> = {
  VENDA: { icon: ShoppingCart, chipClass: 'admin-v2-badge-success', iconClass: 'admin-v2-alert-success' },
  CANCELAMENTO: { icon: XCircle, chipClass: 'admin-v2-badge-danger', iconClass: 'admin-v2-alert-danger' },
  AJUSTE_ESTOQUE: { icon: Package, chipClass: 'admin-v2-badge-muted', iconClass: 'bg-white/[0.06] text-jl-fg-2' },
  ALERTA: { icon: AlertTriangle, chipClass: 'admin-v2-badge-warning', iconClass: 'admin-v2-alert-warning' },
  DESCONTO: { icon: Percent, chipClass: 'admin-v2-badge-gold', iconClass: 'admin-v2-alert-warning' },
}

function tipoVisualLabel(tipo: AuditoriaTipo, l: AuditoriaLabels): string {
  const map: Record<AuditoriaTipo, string> = {
    VENDA: l.auditoria_tipo_venda_singular,
    CANCELAMENTO: l.auditoria_tipo_cancelamento_singular,
    AJUSTE_ESTOQUE: l.auditoria_tipo_estoque_singular,
    ALERTA: l.auditoria_tipo_alerta_singular,
    DESCONTO: l.auditoria_tipo_desconto_singular,
  }
  return map[tipo]
}

function detalheLabels(l: AuditoriaLabels): Record<string, string> {
  return {
    forma_pagamento: l.auditoria_detalhe_forma_pagamento,
    total_bruto: l.auditoria_detalhe_total_bruto,
    total_liquido: l.auditoria_detalhe_total_liquido,
    itens: l.auditoria_detalhe_itens,
    venda_id: l.auditoria_detalhe_venda_id,
    motivo: l.auditoria_detalhe_motivo,
    valor_estornado: l.auditoria_detalhe_valor_estornado,
    produto_id: l.auditoria_detalhe_produto_id,
    produto_nome: l.auditoria_detalhe_produto_nome,
    tipo_codigo: l.auditoria_detalhe_tipo_codigo,
    quantidade_delta: l.auditoria_detalhe_quantidade_delta,
    observacao: l.auditoria_detalhe_observacao,
    tipo: l.auditoria_detalhe_tipo,
    gerente_id: l.auditoria_detalhe_gerente_id,
    desconto_percentual: l.auditoria_detalhe_desconto_percentual,
    desconto_valor: l.auditoria_detalhe_desconto_valor,
  }
}

function isFocusable(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && !el.hasAttribute('disabled') && el.tabIndex !== -1
}

function detalheValor(chave: string, valor: string | number | null): string {
  if (valor == null || valor === '') return '—'
  if (chave === 'total_bruto' || chave === 'total_liquido' || chave === 'valor_estornado' || chave === 'desconto_valor') {
    return formatBRL(Number(valor))
  }
  return String(valor)
}

export function AuditoriaTimeline({ eventos, labels }: { eventos: AuditoriaEvento[]; labels: AuditoriaLabels }) {
  const [aberto, setAberto] = useState<AuditoriaEvento | null>(null)

  if (eventos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="text-3xl text-jl-fg-3" aria-hidden>
          🗒️
        </span>
        <p className="text-[13px] font-medium text-jl-fg-2">{labels.auditoria_vazio_titulo}</p>
        <p className="text-[11px] text-jl-fg-3">{labels.auditoria_vazio_sub}</p>
      </div>
    )
  }

  return (
    <>
      <ul className="flex flex-col">
        {eventos.map((e) => {
          const visual = TIPO_VISUAL[e.tipo]
          const Icon = visual.icon
          return (
            <li key={e.id} className="border-t border-[var(--color-border-secondary)] first:border-t-0">
              <button
                type="button"
                onClick={() => setAberto(e)}
                className="flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    visual.iconClass,
                  )}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-jl-fg-1">{e.resumo}</span>
                    {e.valor != null ? (
                      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-jl-fg-1">
                        {formatBRL(e.valor)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-medium leading-none',
                        visual.chipClass,
                      )}
                    >
                      {tipoVisualLabel(e.tipo, labels)}
                    </span>
                    <span className="text-[10px] text-jl-fg-3">{dtFmt.format(new Date(e.ocorridoEm))}</span>
                    {e.operadorNome ? (
                      <span className="text-[10px] text-jl-fg-3">· {e.operadorNome}</span>
                    ) : null}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {aberto ? <AuditoriaDetailSheet evento={aberto} onClose={() => setAberto(null)} labels={labels} /> : null}
    </>
  )
}

function AuditoriaDetailSheet({
  evento,
  onClose,
  labels,
}: {
  evento: AuditoriaEvento
  onClose: () => void
  labels: AuditoriaLabels
}) {
  const panelRef = useRef<HTMLElement>(null)

  // Escape + trava de scroll + ciclo de Tab contido no painel (mesma técnica
  // de KardexSheet.tsx — este sheet lateral não usa DragonModal porque é um
  // padrão de UI diferente — drawer, não diálogo centralizado — mas precisa
  // do mesmo comportamento de foco para não vazar Tab para trás do overlay).
  useEffect(() => {
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
  }, [onClose])

  const visual = TIPO_VISUAL[evento.tipo]
  const entradas = Object.entries(evento.detalhe).filter(([, v]) => v != null && v !== '')
  const DETALHE_LABELS = detalheLabels(labels)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="auditoria-detalhe-titulo">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside ref={panelRef} tabIndex={-1} className="admin-v2-sheet relative z-10 flex h-full w-full max-w-md flex-col outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-secondary)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="auditoria-detalhe-titulo" className="text-[15px] font-semibold text-jl-fg-1">
              {evento.resumo}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-jl-fg-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-medium leading-none',
                  visual.chipClass,
                )}
              >
                {tipoVisualLabel(evento.tipo, labels)}
              </span>
              <span>{dtFmt.format(new Date(evento.ocorridoEm))}</span>
              {evento.operadorNome ? <span>· {evento.operadorNome}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.auditoria_fechar}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {evento.valor != null ? (
            <div className="admin-v2-panel mb-3 rounded-[10px] p-3">
              <div className="text-[11px] text-jl-fg-3">{labels.auditoria_valor_label}</div>
              <div className="text-[18px] font-semibold tabular-nums text-jl-fg-1">
                {formatBRL(evento.valor)}
              </div>
            </div>
          ) : null}

          <dl className="flex flex-col">
            {entradas.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-jl-fg-3">{labels.auditoria_sem_detalhes}</p>
            ) : (
              entradas.map(([chave, valor]) => (
                <div
                  key={chave}
                  className="flex items-start justify-between gap-3 border-t border-[var(--color-border-secondary)] py-2 first:border-t-0"
                >
                  <dt className="text-[11px] text-jl-fg-3">{DETALHE_LABELS[chave] ?? chave}</dt>
                  <dd className="max-w-[60%] break-words text-right text-[12px] text-jl-fg-1">
                    {detalheValor(chave, valor)}
                  </dd>
                </div>
              ))
            )}
          </dl>
        </div>
      </aside>
    </div>
  )
}
