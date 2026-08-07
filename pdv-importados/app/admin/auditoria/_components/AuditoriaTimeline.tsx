'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Package,
  Percent,
  RotateCcw,
  ShoppingCart,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'
import { DetailSheet } from '@/components/ui/DetailSheet'
import { EmptyState } from '@/components/ui/feedback'
import type { AuditoriaEvento, AuditoriaTipo } from '../actions'

const dtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

type TipoVisual = {
  label: string
  icon: LucideIcon
  /** Classe do badge/ícone (reusa tokens admin-v2 / tailwind já presentes). */
  chipClass: string
  iconClass: string
}

const TIPO_VISUAL: Record<AuditoriaTipo, TipoVisual> = {
  VENDA: {
    label: 'Venda',
    icon: ShoppingCart,
    chipClass: 'admin-v2-badge-success',
    iconClass: 'admin-v2-alert-success',
  },
  CANCELAMENTO: {
    label: 'Cancelamento',
    icon: XCircle,
    chipClass: 'admin-v2-badge-danger',
    iconClass: 'admin-v2-alert-danger',
  },
  AJUSTE_ESTOQUE: {
    label: 'Estoque',
    icon: Package,
    chipClass: 'admin-v2-badge-muted',
    iconClass: 'bg-white/[0.06] text-jl-fg-2',
  },
  ALERTA: {
    label: 'Alerta',
    icon: AlertTriangle,
    chipClass: 'admin-v2-badge-warning',
    iconClass: 'admin-v2-alert-warning',
  },
  DESCONTO: {
    label: 'Desconto',
    icon: Percent,
    chipClass: 'admin-v2-badge-gold',
    iconClass: 'admin-v2-alert-warning',
  },
  DEVOLUCAO: {
    label: 'Devolução/Troca',
    icon: RotateCcw,
    chipClass: 'admin-v2-badge-warning',
    iconClass: 'admin-v2-alert-warning',
  },
}

const DETALHE_LABELS: Record<string, string> = {
  forma_pagamento: 'Forma de pagamento',
  total_bruto: 'Total bruto',
  total_liquido: 'Total líquido',
  itens: 'Itens',
  venda_id: 'Venda',
  motivo: 'Motivo',
  valor_estornado: 'Valor estornado',
  produto_id: 'Produto (ID)',
  produto_nome: 'Produto',
  tipo_codigo: 'Tipo de movimento',
  quantidade_delta: 'Quantidade',
  observacao: 'Observação',
  tipo: 'Tipo de alerta',
  gerente_id: 'Gerente',
  desconto_percentual: 'Desconto (%)',
  desconto_valor: 'Desconto (R$)',
  tipo_operacao: 'Tipo de operação',
  forma_estorno: 'Forma de estorno',
  valor_caixa_estornado: 'Valor estornado em caixa',
}

function detalheValor(chave: string, valor: string | number | null): string {
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
  return String(valor)
}

export function AuditoriaTimeline({ eventos }: { eventos: AuditoriaEvento[] }) {
  const [aberto, setAberto] = useState<AuditoriaEvento | null>(null)

  if (eventos.length === 0) {
    return (
      <EmptyState
        title="Nenhum evento no período"
        description="Ajuste o período ou o tipo de evento para ver a trilha de auditoria."
      />
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
                      {visual.label}
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

      {aberto ? <AuditoriaDetailSheet evento={aberto} onClose={() => setAberto(null)} /> : null}
    </>
  )
}

function AuditoriaDetailSheet({
  evento,
  onClose,
}: {
  evento: AuditoriaEvento
  onClose: () => void
}) {
  const visual = TIPO_VISUAL[evento.tipo]
  const entradas = Object.entries(evento.detalhe).filter(([, v]) => v != null && v !== '')

  return (
    <DetailSheet
      open
      onClose={onClose}
      className="max-w-md"
      title={evento.resumo}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-medium leading-none',
              visual.chipClass,
            )}
          >
            {visual.label}
          </span>
          <span>{dtFmt.format(new Date(evento.ocorridoEm))}</span>
          {evento.operadorNome ? <span>· {evento.operadorNome}</span> : null}
        </span>
      }
    >
      {evento.valor != null ? (
        <div className="admin-v2-panel mb-3 rounded-[10px] p-3">
          <div className="text-[11px] text-fg-subtle">Valor</div>
          <div className="text-[18px] font-semibold tabular-nums text-fg">{formatBRL(evento.valor)}</div>
        </div>
      ) : null}

      <dl className="flex flex-col">
        {entradas.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-fg-subtle">Sem detalhes adicionais.</p>
        ) : (
          entradas.map(([chave, valor]) => (
            <div
              key={chave}
              className="flex items-start justify-between gap-3 border-t border-[var(--color-border)] py-2 first:border-t-0"
            >
              <dt className="text-[11px] text-fg-subtle">{DETALHE_LABELS[chave] ?? chave}</dt>
              <dd className="max-w-[60%] break-words text-right text-[12px] text-fg">
                {detalheValor(chave, valor)}
              </dd>
            </div>
          ))
        )}
      </dl>
    </DetailSheet>
  )
}
