import { memo } from 'react'

type GerenteStatusBadgeProps = Readonly<{
  /** Chave de estilo (ex.: status de venda/caixa ou ATIVO / ALERTA). */
  status: string
  /** Texto exibido; se omitido, usa `status`. */
  label?: string
}>

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  CONCLUIDA: { bg: '#ecfdf5', color: '#166534', border: '#bbf7d0' },
  ABERTO: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  FECHADO: { bg: '#f3f4f6', color: '#111827', border: '#d1d5db' },
  CANCELADA: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  PARCIAL: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  ATIVO: { bg: '#ecfdf5', color: '#166534', border: '#bbf7d0' },
  INATIVO: { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  ALERTA: { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  CRITICO: { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' },
  ERRO: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  PENDENTE: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  EMITIDO: { bg: '#ecfdf5', color: '#166534', border: '#bbf7d0' },
  PROCESSANDO: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  TEM_NF: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  SEM_NF: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
}

/** Badge compacto para status operacionais na área gerente. */
export const GerenteStatusBadge = memo(function GerenteStatusBadge({
  status,
  label,
}: GerenteStatusBadgeProps) {
  const text = label ?? status
  const style = STATUS_STYLE[status] ?? { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        fontSize: 11,
        padding: '2px 8px',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  )
})
