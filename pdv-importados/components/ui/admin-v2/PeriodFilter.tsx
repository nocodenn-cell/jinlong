import Link from 'next/link'
import type { Periodo } from '@/lib/admin/periodo'

/**
 * Filtro de período único das telas admin (UX-013): mesmo markup, mesma ordem e mesmo vocabulário
 * (Hoje · Ontem · 7 dias · 30 dias · Mês atual · Todos), com o período na URL (`?periodo=`).
 * Cada tela diz quais opções oferece e como montar o href (cada uma preserva seus demais filtros).
 */
export type PeriodFilterLabels = Readonly<Record<Periodo, string>>

/** Ordem canônica de exibição. */
export const PERIODOS_ORDEM: readonly Periodo[] = ['hoje', 'ontem', '7d', '30d', 'mes', 'tudo']

/** Vocabulário único a partir do dicionário admin_ui. */
export function periodoLabelsAdmin(ui: {
  vendas_periodo_label_hoje: string
  vendas_periodo_label_ontem: string
  auditoria_periodo_7d: string
  vendas_periodo_label_30d: string
  vendas_periodo_label_mes: string
  filtro_todos: string
}): PeriodFilterLabels {
  return {
    hoje: ui.vendas_periodo_label_hoje,
    ontem: ui.vendas_periodo_label_ontem,
    '7d': ui.auditoria_periodo_7d,
    '30d': ui.vendas_periodo_label_30d,
    mes: ui.vendas_periodo_label_mes,
    tudo: ui.filtro_todos,
  }
}

export function PeriodFilter({
  options,
  active,
  labels,
  hrefFor,
}: {
  options: readonly Periodo[]
  active: Periodo
  labels: PeriodFilterLabels
  hrefFor: (periodo: Periodo) => string
}) {
  const ordenadas = PERIODOS_ORDEM.filter((p) => options.includes(p))
  return (
    <div className="admin-v2-segmented" role="group" data-testid="period-filter">
      {ordenadas.map((option) => (
        <Link
          key={option}
          href={hrefFor(option)}
          data-active={active === option}
          aria-current={active === option ? 'true' : undefined}
          className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        >
          {labels[option]}
        </Link>
      ))}
    </div>
  )
}
