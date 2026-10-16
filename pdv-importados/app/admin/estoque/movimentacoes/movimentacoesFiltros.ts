import type { FilterDef } from '@/components/ui/FilterBar'
import { periodoLabelsAdmin } from '@/components/ui/admin-v2/PeriodFilter'
import type { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'

type AdminUi = ReturnType<typeof getMessages>['admin_ui']

/** Presets de período de Movimentações (padrão de filtros do Admin V2). "tudo" = sem recorte. */
export const PERIODOS_MOVIMENTACAO = ['tudo', '7d', '30d', 'mes'] as const
export type PeriodoMovimentacao = (typeof PERIODOS_MOVIMENTACAO)[number]

export function periodoMovimentacao(raw: string | undefined): PeriodoMovimentacao {
  return (PERIODOS_MOVIMENTACAO as readonly string[]).includes(raw ?? '') ? (raw as PeriodoMovimentacao) : 'tudo'
}

export function sentidoAtivo(raw: string | undefined): string {
  return raw === 'entrada' || raw === 'saida' ? raw : ''
}

export function hrefMovimentacoes({
  q,
  sentido,
  periodo,
  page,
}: {
  q: string
  sentido: string
  periodo: PeriodoMovimentacao
  page: number
}): string {
  const params = new URLSearchParams({ q, sentido, page: String(page) })
  if (periodo !== 'tudo') params.set('periodo', periodo)
  return `${ROUTES.admin.estoqueMovimentacoes}?${params}`
}

export function filtrosMovimentacao(ui: AdminUi): FilterDef[] {
  const periodoLabels = periodoLabelsAdmin(ui)
  return [
    { type: 'search', key: 'q', placeholder: ui.estoque_mov_busca },
    {
      type: 'pills',
      key: 'sentido',
      defaultValue: '',
      options: [
        { value: '', label: ui.estoque_mov_todos },
        { value: 'entrada', label: ui.estoque_mov_entradas },
        { value: 'saida', label: ui.estoque_mov_saidas },
      ],
    },
    {
      type: 'pills',
      key: 'periodo',
      defaultValue: 'tudo',
      options: PERIODOS_MOVIMENTACAO.map((p) => ({ value: p, label: periodoLabels[p] })),
    },
  ]
}
