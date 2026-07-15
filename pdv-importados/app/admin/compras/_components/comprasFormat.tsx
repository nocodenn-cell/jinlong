import type { Mensagens } from '@/i18n/getMessages'
import type { StatusOC } from '../actions'

const STATUS_BADGE: Record<StatusOC, string> = {
  RASCUNHO: 'admin-v2-badge-muted',
  CONFIRMADA: 'admin-v2-badge-gold',
  EM_TRANSITO: 'admin-v2-badge-warning',
  RECEBIDA: 'admin-v2-badge-success',
  CANCELADA: 'admin-v2-badge-danger',
}

export function fmtDataOc(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function idCurtoOc(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function OcStatusBadge({ status, m }: { status: StatusOC; m: Mensagens }) {
  return (
    <span
      className={`${STATUS_BADGE[status]} inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none`}
    >
      {m.compras[`status_${status}`]}
    </span>
  )
}
