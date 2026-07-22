'use client'

import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import type { DashboardPeriod } from '../dashboardUtils'

type Props = {
  options: Array<{ id: DashboardPeriod; label: string }>
}

/**
 * Filtro de período do Dashboard — mesmo contrato URL (`period`), UI via FilterBar DS.
 * Não altera regras de negócio: só a apresentação dos pills.
 */
export function DashboardFilters({ options }: Props) {
  const filters: FilterDef[] = [
    {
      type: 'pills',
      key: 'period',
      label: 'Período',
      defaultValue: 'TODAY',
      options: options.map((o) => ({ value: o.id, label: o.label })),
    },
  ]

  return <FilterBar filters={filters} clearable={false} />
}
