import { memo } from 'react'
import { StatusChip } from '@/components/ui/StatusChip'

type GerenteStatusBadgeProps = Readonly<{
  status: string
  label?: string
}>

/**
 * @deprecated Preferir `StatusChip` do DS. Shim visual (Onda 7).
 */
export const GerenteStatusBadge = memo(function GerenteStatusBadge({
  status,
  label,
}: GerenteStatusBadgeProps) {
  return <StatusChip status={status} label={label} />
})
