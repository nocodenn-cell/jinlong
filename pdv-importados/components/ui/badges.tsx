/**
 * FastProduct Admin — Badges & micro-indicadores (Fase 2)
 *
 * Conjunto de pílulas pequenas usadas em tabelas e cards do painel /admin.
 * Todos os tokens vêm de `styles/admin-theme.css`, escopados em
 * [data-admin-layout="true"] — estes componentes só renderizam com as cores
 * corretas dentro do shell /admin.
 *
 * Exporta: StatusBadge, OriginBadge, PaymentBadge, FiscalBadge, DeltaChip,
 * SeverityDot — agrupados de propósito (são pequenos demais p/ arquivos
 * separados e quase sempre importados juntos).
 *
 * Componentes puros: zero estado, zero query, server-component-safe.
 */

import * as React from 'react'
import {
  AlertTriangle,
  Ban,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  FileX,
  Globe,
  PencilLine,
  QrCode,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Pílula base ────────────────────────────────────────────────────────────

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral'

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  success: {
    background: 'var(--fp-success-bg)',
    border: '1px solid var(--fp-success-border)',
    color: 'var(--fp-success)',
  },
  warning: {
    background: 'var(--fp-warning-bg)',
    border: '1px solid var(--fp-warning-border)',
    color: 'var(--fp-warning)',
  },
  danger: {
    background: 'var(--fp-danger-bg)',
    border: '1px solid var(--fp-danger-border)',
    color: 'var(--fp-danger)',
  },
  info: {
    background: 'var(--fp-info-bg)',
    border: '1px solid var(--fp-info-border)',
    color: 'var(--fp-info)',
  },
  purple: {
    background: 'var(--fp-purple-bg)',
    border: '1px solid var(--fp-purple-border)',
    color: 'var(--fp-purple)',
  },
  neutral: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--fp-border)',
    color: 'var(--fp-text-secondary)',
  },
}

type PillProps = {
  tone: Tone
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
  title?: string
  ariaLabel?: string
  role?: 'status' | 'img' | string
}

function Pill({ tone, icon: Icon, children, className, title, ariaLabel, role }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px]',
        'text-[11px] font-medium leading-none',
        className
      )}
      style={TONE_STYLE[tone]}
      title={title}
      aria-label={ariaLabel}
      role={role}
    >
      {Icon ? <Icon size={11} strokeWidth={2} aria-hidden /> : null}
      {children}
    </span>
  )
}

// ─── StatusBadge (status de venda) ──────────────────────────────────────────
//
// Status canônico de venda = CONCLUIDA (NÃO "FINALIZADA").

export type VendaStatus = 'CONCLUIDA' | 'CANCELADA' | 'PENDENTE' | 'DEVOLVIDA'

const STATUS_TONE: Record<VendaStatus, Tone> = {
  CONCLUIDA: 'success',
  CANCELADA: 'danger',
  PENDENTE: 'warning',
  DEVOLVIDA: 'purple',
}

const STATUS_LABEL: Record<VendaStatus, string> = {
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  PENDENTE: 'Pendente',
  DEVOLVIDA: 'Devolvida',
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: VendaStatus
  /** Sobrescreve o rótulo padrão (ex.: bilíngue PT·ZH). */
  label?: string
  className?: string
}) {
  const displayLabel = label ?? STATUS_LABEL[status]
  return (
    <Pill
      tone={STATUS_TONE[status]}
      className={className}
      role="status"
      ariaLabel={`Status: ${displayLabel}`}
    >
      {displayLabel}
    </Pill>
  )
}

// ─── OriginBadge (origem do cadastro / produto) ─────────────────────────────

export type Origin = 'IMPORTADO' | 'NACIONAL' | 'NFE' | 'MANUAL'

const ORIGIN_CONFIG: Record<Origin, { tone: Tone; icon: LucideIcon; label: string }> = {
  IMPORTADO: { tone: 'info', icon: Globe, label: 'Importado' },
  NACIONAL: { tone: 'neutral', icon: Globe, label: 'Nacional' },
  NFE: { tone: 'purple', icon: FileText, label: 'NF-e' },
  MANUAL: { tone: 'neutral', icon: PencilLine, label: 'Manual' },
}

export function OriginBadge({
  origin,
  label,
  className,
}: {
  origin: Origin
  label?: string
  className?: string
}) {
  const cfg = ORIGIN_CONFIG[origin]
  return (
    <Pill tone={cfg.tone} icon={cfg.icon} className={className}>
      {label ?? cfg.label}
    </Pill>
  )
}

// ─── PaymentBadge (forma de pagamento) ──────────────────────────────────────

export type Payment = 'DINHEIRO' | 'PIX' | 'CREDITO' | 'DEBITO' | 'CARTAO' | 'OUTRO'

const PAYMENT_CONFIG: Record<Payment, { tone: Tone; icon: LucideIcon; label: string }> = {
  DINHEIRO: { tone: 'success', icon: Banknote, label: 'Dinheiro' },
  PIX: { tone: 'info', icon: QrCode, label: 'PIX' },
  CREDITO: { tone: 'purple', icon: CreditCard, label: 'Crédito' },
  DEBITO: { tone: 'info', icon: CreditCard, label: 'Débito' },
  CARTAO: { tone: 'neutral', icon: CreditCard, label: 'Cartão' },
  OUTRO: { tone: 'neutral', icon: Wallet, label: 'Outro' },
}

export function PaymentBadge({
  payment,
  label,
  className,
}: {
  payment: Payment
  label?: string
  className?: string
}) {
  const cfg = PAYMENT_CONFIG[payment]
  return (
    <Pill tone={cfg.tone} icon={cfg.icon} className={className}>
      {label ?? cfg.label}
    </Pill>
  )
}

// ─── FiscalBadge (situação da NF-e) ─────────────────────────────────────────

export type Fiscal = 'EMITIDA' | 'PENDENTE' | 'CANCELADA' | 'ERRO' | 'SEM_NOTA'

const FISCAL_CONFIG: Record<Fiscal, { tone: Tone; icon: LucideIcon; label: string }> = {
  EMITIDA: { tone: 'success', icon: CheckCircle2, label: 'Emitida' },
  PENDENTE: { tone: 'warning', icon: Clock, label: 'Pendente' },
  CANCELADA: { tone: 'danger', icon: Ban, label: 'Cancelada' },
  ERRO: { tone: 'danger', icon: AlertTriangle, label: 'Erro' },
  SEM_NOTA: { tone: 'neutral', icon: FileX, label: 'Sem nota' },
}

export function FiscalBadge({
  fiscal,
  label,
  className,
}: {
  fiscal: Fiscal
  label?: string
  className?: string
}) {
  const cfg = FISCAL_CONFIG[fiscal]
  return (
    <Pill tone={cfg.tone} icon={cfg.icon} className={className}>
      {label ?? cfg.label}
    </Pill>
  )
}

// ─── DeltaChip (variação percentual com seta) ───────────────────────────────

export function DeltaChip({
  value,
  positiveIsGood = true,
  suffix = '%',
  precision = 1,
  className,
}: {
  /** Variação já calculada (ex.: 12.4 ou -3.1). */
  value: number
  /** Quando false, queda é "boa" (verde) — ex.: estoque baixo, custo. */
  positiveIsGood?: boolean
  suffix?: string
  precision?: number
  className?: string
}) {
  const isZero = value === 0 || Number.isNaN(value)
  const isUp = value > 0
  const good = positiveIsGood ? isUp : !isUp

  const color = isZero
    ? 'var(--fp-text-muted)'
    : good
      ? 'var(--fp-success)'
      : 'var(--fp-danger)'

  const arrow = isZero ? '–' : isUp ? '↑' : '↓'
  const magnitude = isZero ? '' : `${Math.abs(value).toFixed(precision)}${suffix}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none',
        className
      )}
      style={{ color }}
    >
      <span aria-hidden>{arrow}</span>
      {magnitude}
    </span>
  )
}

// ─── SeverityDot (ponto colorido de 3 linhas) ───────────────────────────────

export type Severity = 'critical' | 'warning' | 'ok' | 'info' | 'neutral'

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'var(--fp-danger)',
  warning: 'var(--fp-warning)',
  ok: 'var(--fp-success)',
  info: 'var(--fp-info)',
  neutral: 'var(--fp-text-muted)',
}

export function SeverityDot({
  severity,
  className,
  title,
}: {
  severity: Severity
  className?: string
  title?: string
}) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ background: SEVERITY_COLOR[severity] }}
      title={title}
      aria-hidden
    />
  )
}
