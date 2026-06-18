import { memo } from 'react'

type GerenteStatusBadgeProps = Readonly<{
  /** Chave de estilo (ex.: status de venda/caixa ou ATIVO / ALERTA). */
  status: string
  /** Texto exibido; se omitido, usa `status`. */
  label?: string
}>

/** Mapeamento de status → tokens CSS (adaptam a dark e light theme). */
const STATUS_TOKEN: Record<string, string> = {
  CONCLUIDA:    'success',
  ATIVO:        'success',
  EMITIDO:      'success',
  ABERTO:       'info',
  PROCESSANDO:  'info',
  TEM_NF:       'info',
  FECHADO:      'neutral',
  INATIVO:      'neutral',
  CANCELADA:    'danger',
  ERRO:         'danger',
  PARCIAL:      'warning',
  PENDENTE:     'warning',
  SEM_NF:       'warning',
  ALERTA:       'warning',
  CRITICO:      'orange',
}

/** Badge compacto para status operacionais. Adapta a dark e light theme via CSS vars. */
export const GerenteStatusBadge = memo(function GerenteStatusBadge({
  status,
  label,
}: GerenteStatusBadgeProps) {
  const text = label ?? status
  const tone = STATUS_TOKEN[status] ?? 'neutral'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        fontSize: 11,
        padding: '2px 8px',
        fontWeight: 600,
        background: `var(--jl-status-${tone}-bg)`,
        color: `var(--jl-status-${tone}-text)`,
        border: `1px solid var(--jl-status-${tone}-border)`,
      }}
    >
      {text}
    </span>
  )
})
