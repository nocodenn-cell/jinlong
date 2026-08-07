import { ListPageSkeleton } from '@/components/ui/admin-v2'

/**
 * Relatórios não tem faixa de KPI (`admin-v2-grid-kpi`) — abre direto em
 * gráficos e tabelas. Esboçar cards aqui deslocaria o layout na troca.
 */
export default function Loading() {
  return <ListPageSkeleton kpis={0} rows={6} />
}
