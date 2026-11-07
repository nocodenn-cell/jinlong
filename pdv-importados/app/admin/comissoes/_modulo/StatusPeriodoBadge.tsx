import type { StatusPeriodo } from '@/app/gerente/comissoes/moduloActions'

const COR: Record<StatusPeriodo, string> = {
  ABERTO: 'bg-jl-surface-soft text-jl-fg-1',
  EM_REVISAO: 'bg-amber-100 text-amber-900',
  APROVADO: 'bg-sky-100 text-sky-900',
  PAGO: 'bg-emerald-100 text-emerald-900',
}
export function StatusPeriodoBadge({ status, t }: { status: StatusPeriodo; t: Record<string, string> }) {
  return (
    <span data-testid="comissao-status-periodo" className={`rounded-full px-3 py-1 text-xs font-bold ${COR[status]}`}>
      {t[`status_${status.toLowerCase()}`] ?? status}
    </span>
  )
}
