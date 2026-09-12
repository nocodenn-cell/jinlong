import type { SituacaoTitulo } from '@shared-core/src/financial'
import { cn } from '@/lib/utils'

/**
 * Selo de situação de título (AP e AR), sobre a política `situacaoTitulo` do
 * shared-core. Nada é decidido aqui: o componente só escolhe o tom e o rótulo.
 *
 * Antes, a linha exibia o status contábil cru (PENDENTE/PARCIAL/PAGO) — um
 * título vencido ontem e um que vence em 30 dias ficavam idênticos na tela. As
 * sete situações abaixo são as seis do Bling mais CANCELADO.
 */

export type SituacaoTituloLabels = Readonly<Record<SituacaoTitulo, string>>

const TOM: Readonly<Record<SituacaoTitulo, string>> = {
  QUITADO: 'admin-v2-badge-success',
  CANCELADO: 'admin-v2-badge-muted',
  ATRASADO: 'admin-v2-badge-danger',
  PARCIAL_ATRASADO: 'admin-v2-badge-danger',
  VENCE_HOJE: 'admin-v2-badge-warning',
  PARCIAL_EM_DIA: 'admin-v2-badge-gold',
  EM_ABERTO: 'admin-v2-badge-muted',
}

type Props = Readonly<{
  situacao: SituacaoTitulo
  labels: SituacaoTituloLabels
  className?: string
}>

export function SituacaoTituloBadge({ situacao, labels, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold leading-none',
        TOM[situacao],
        className,
      )}
    >
      {labels[situacao]}
    </span>
  )
}
