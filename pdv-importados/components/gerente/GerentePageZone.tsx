import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Zona funcional de página gerente.
 *
 * Uso recomendado por página densa:
 *   kpi-critico  → MetricCards tier=1
 *   kpi-oper     → MetricCards tier=2
 *   tabela       → GerenteTable principal
 *   eventos      → feed de atividades, totais, seções secundárias
 */
export type GerentePageZoneKind =
  | 'kpi-critico'
  | 'kpi-oper'
  | 'tabela'
  | 'eventos'
  | 'toolbar'

type Props = Readonly<{
  kind: GerentePageZoneKind
  children: ReactNode
  className?: string
}>

const KIND_CN: Record<GerentePageZoneKind, string> = {
  'toolbar':    '',
  'kpi-critico': 'mb-4',
  'kpi-oper':   'mb-6',
  'tabela':     'mb-6',
  'eventos':    'mb-4',
}

export function GerentePageZone({ kind, children, className }: Props) {
  return (
    <section
      data-zone={kind}
      aria-label={kind}
      className={cn(KIND_CN[kind], className)}
    >
      {children}
    </section>
  )
}
