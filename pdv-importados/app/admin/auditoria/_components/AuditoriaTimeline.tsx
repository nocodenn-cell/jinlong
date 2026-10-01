'use client'

import { humanizarCodigo } from '@/lib/format/vendaLabels'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Package,
  Percent,
  RotateCcw,
  ShoppingCart,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { KardexSheet, type KardexAlvo, type KardexLabels } from '@/app/admin/estoque/_components/KardexSheet'
import type { AuditoriaEvento, AuditoriaTipo } from '../actions'

/**
 * Item 16 do Plano Mestre: todo texto vem de `labels` (resolvido em
 * `page.tsx` via `getMessages(session.idioma)`) — nada hardcoded em PT
 * aqui. `resumoTemplates`/`ajusteLabels`/`alertaLabels`/`formaLabels`
 * resolvem os códigos estáveis gravados por `listarEventosAuditoria`
 * (`resumoCodigo`/`resumoParams`) no idioma da sessão.
 */
export type AuditoriaTimelineLabels = {
  locale: string
  chipVenda: string
  chipCancelamento: string
  chipEstoque: string
  chipAlerta: string
  chipDesconto: string
  chipDevolucao: string
  detalheLabels: Record<string, string>
  vazioTitulo: string
  vazioSub: string
  fecharAria: string
  valorLabel: string
  semDetalhes: string
  resumoTemplates: Record<string, string>
  ajusteLabels: Record<string, string>
  alertaLabels: Record<string, string>
  formaLabels: Record<string, string>
  verKardex: string
  kardex: KardexLabels
}

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
  DEVOLUCAO: { icon: RotateCcw, chipClass: 'admin-v2-badge-warning', iconClass: 'admin-v2-alert-warning' },
}

function tipoChipLabel(tipo: AuditoriaTipo, labels: AuditoriaTimelineLabels): string {
  switch (tipo) {
    case 'VENDA':
      return labels.chipVenda
    case 'CANCELAMENTO':
      return labels.chipCancelamento
    case 'AJUSTE_ESTOQUE':
      return labels.chipEstoque
    case 'ALERTA':
      return labels.chipAlerta
    case 'DESCONTO':
      return labels.chipDesconto
    case 'DEVOLUCAO':
      return labels.chipDevolucao
  }
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
    template,
  )
}

/** Resolve `resumoCodigo`/`resumoParams` (dado estruturado) para texto no idioma da sessão. */
export function resumoTexto(evento: AuditoriaEvento, labels: AuditoriaTimelineLabels): string {
  const { resumoCodigo, resumoParams } = evento
  const params = { ...resumoParams }
  if (resumoCodigo === 'ajuste_estoque') {
    const codigo = String(resumoParams.codigo ?? '')
    params.tipo = labels.ajusteLabels[codigo] ?? humanizarCodigo(codigo)
  }
  if (resumoCodigo === 'alerta') {
    const tipo = String(resumoParams.tipo ?? '')
    return labels.alertaLabels[tipo] ?? tipo
  }
  if (resumoCodigo === 'troca' || resumoCodigo === 'devolucao') {
    const forma = String(resumoParams.forma ?? '')
    params.forma = labels.formaLabels[forma] ?? forma
  }
  const template = labels.resumoTemplates[resumoCodigo]
  if (!template) return resumoCodigo
  const texto = interpolate(template, params)
  // Ajuste de estoque sem o produto na linha ("Saída por venda • −1") não diz o que mudou.
  if (resumoCodigo === 'ajuste_estoque') {
    const produto = evento.detalhe?.produto_nome
    if (typeof produto === 'string' && produto) return `${produto} — ${texto}`
  }
  return texto
}

function detalheValor(
  chave: string,
  valor: string | number | null,
  labels: AuditoriaTimelineLabels,
): string {
  if (valor == null || valor === '') return '—'
  if (
    chave === 'total_bruto' ||
    chave === 'total_liquido' ||
    chave === 'valor_estornado' ||
    chave === 'desconto_valor' ||
    chave === 'valor_caixa_estornado'
  ) {
    return formatBRL(Number(valor))
  }
  if (chave === 'tipo_codigo') return labels.ajusteLabels[String(valor)] ?? humanizarCodigo(String(valor))
  if (chave === 'tipo') return labels.alertaLabels[String(valor)] ?? String(valor)
  if (chave === 'forma_estorno') return labels.formaLabels[String(valor)] ?? String(valor)
  return String(valor)
}

export function AuditoriaTimeline({
  eventos,
  labels,
}: {
  eventos: AuditoriaEvento[]
  labels: AuditoriaTimelineLabels
}) {
  const [aberto, setAberto] = useState<AuditoriaEvento | null>(null)
  const [kardexAlvo, setKardexAlvo] = useState<KardexAlvo | null>(null)

  if (eventos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="text-3xl text-jl-fg-3" aria-hidden>
          🗒️
        </span>
        <p className="text-[13px] font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
        <p className="text-[11px] text-jl-fg-3">{labels.vazioSub}</p>
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
                    <span className="truncate text-[12px] font-medium text-jl-fg-1">
                      {resumoTexto(e, labels)}
                    </span>
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
                      {tipoChipLabel(e.tipo, labels)}
                    </span>
                    <span className="text-[10px] text-jl-fg-3">
                      {formatDateTimeOrDash(e.ocorridoEm, labels.locale, 'short')}
                    </span>
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

      {aberto ? (
        <AuditoriaDetailSheet
          evento={aberto}
          labels={labels}
          onClose={() => setAberto(null)}
          onAbrirKardex={setKardexAlvo}
        />
      ) : null}

      <KardexSheet alvo={kardexAlvo} onClose={() => setKardexAlvo(null)} labels={labels.kardex} />
    </>
  )
}

function AuditoriaDetailSheet({
  evento,
  labels,
  onClose,
  onAbrirKardex,
}: {
  evento: AuditoriaEvento
  labels: AuditoriaTimelineLabels
  onClose: () => void
  onAbrirKardex: (alvo: KardexAlvo) => void
}) {
  useEffect(() => {
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
  }, [onClose])

  const visual = TIPO_VISUAL[evento.tipo]
  const entradas = Object.entries(evento.detalhe).filter(([, v]) => v != null && v !== '')
  const produtoId =
    typeof evento.detalhe.produto_id === 'string' && evento.detalhe.produto_id
      ? evento.detalhe.produto_id
      : null
  const produtoNome =
    typeof evento.detalhe.produto_nome === 'string' && evento.detalhe.produto_nome
      ? evento.detalhe.produto_nome
      : produtoId

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="auditoria-detalhe-titulo">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside className="admin-v2-sheet relative z-10 flex h-full w-full max-w-md flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-secondary)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="auditoria-detalhe-titulo" className="text-[15px] font-semibold text-jl-fg-1">
              {resumoTexto(evento, labels)}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-jl-fg-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-medium leading-none',
                  visual.chipClass,
                )}
              >
                {tipoChipLabel(evento.tipo, labels)}
              </span>
              <span>{formatDateTimeOrDash(evento.ocorridoEm, labels.locale, 'short')}</span>
              {evento.operadorNome ? <span>· {evento.operadorNome}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.fecharAria}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {produtoId ? (
            <button
              type="button"
              onClick={() => onAbrirKardex({ produtoId, produtoNome: produtoNome ?? produtoId })}
              className="admin-v2-panel mb-3 flex w-full items-center justify-between gap-3 rounded-[10px] p-3 text-left transition-colors hover:border-[var(--color-border)]"
            >
              <span className="min-w-0 truncate text-[12px] font-medium text-jl-fg-1">
                {produtoNome}
              </span>
              <span className="shrink-0 text-[11px] font-medium text-[var(--color-info)]">
                {labels.verKardex}
              </span>
            </button>
          ) : null}

          {evento.valor != null ? (
            <div className="admin-v2-panel mb-3 rounded-[10px] p-3">
              <div className="text-[11px] text-jl-fg-3">{labels.valorLabel}</div>
              <div className="text-[18px] font-semibold tabular-nums text-jl-fg-1">
                {formatBRL(evento.valor)}
              </div>
            </div>
          ) : null}

          <dl className="flex flex-col">
            {entradas.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-jl-fg-3">{labels.semDetalhes}</p>
            ) : (
              entradas.map(([chave, valor]) => (
                <div
                  key={chave}
                  className="flex items-start justify-between gap-3 border-t border-[var(--color-border-secondary)] py-2 first:border-t-0"
                >
                  <dt className="text-[11px] text-jl-fg-3">{labels.detalheLabels[chave] ?? chave}</dt>
                  <dd className="max-w-[60%] break-words text-right text-[12px] text-jl-fg-1">
                    {detalheValor(chave, valor, labels)}
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
