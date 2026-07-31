/**
 * Feedback textual do fluxo do caixa (erros, avisos, sucesso de venda).
 * Mantido fora de CaixaPageClient para reduzir ruído na orquestração e facilitar testes E2E por data-testid estáveis.
 */
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { DragonIcon } from '@/components/icons/DragonIcon'

export type CaixaMessageBannerKind = 'error' | 'warning'

export type CaixaMessageBannerProps = {
  mensagem: string | null
  /** Quando true, a mensagem é tratada como sucesso de venda (marcador de teste dedicado). */
  msgVendaOk: boolean
  /** 'error' exibe borda/texto em vermelho (ex.: falha no checkout). Padrão: 'warning' (âmbar). */
  kind?: CaixaMessageBannerKind
  /** Linha secundária com instrução de ação (ex.: "Carrinho preservado — tente novamente."). */
  hint?: string | null
}

/**
 * Superfície clara: o PDV oficial roda sobre `.caixa-oriental-root`
 * (`--jl-surface-base`, #f8fafc). Texto/fundo usam os tokens `*-bg` /
 * `*-border` / `*-strong` do DS — as escalas `-strong` (700) garantem >= 4.5:1
 * sobre o tint 12%. Nunca usar `text-*-100/200/400` aqui: o operador precisa
 * ler o resultado da venda de pé, a um metro do monitor.
 */
const classesError =
  'flex items-start gap-2 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm font-medium text-[var(--color-danger-strong)]'
const classesWarning =
  'flex items-start gap-2 rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-sm font-medium text-[var(--color-warning-strong)]'
const classesVendaOk =
  'dragon-decreto-frame dragon-decreto-print relative flex items-start gap-2 overflow-hidden rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--color-success-strong)]'

export function CaixaMessageBanner({ mensagem, msgVendaOk, kind, hint }: CaixaMessageBannerProps) {
  if (!mensagem) return null

  if (msgVendaOk) {
    return (
      <div
        className={classesVendaOk}
        role="status"
        aria-live="polite"
        data-testid="caixa-status"
      >
        <DragonIcon className="pointer-events-none absolute right-2 top-1/2 h-32 w-32 -translate-y-1/2 text-[var(--color-success)]/[0.06]" />
        <CheckCircle2 className="relative z-10 mt-px h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="relative z-10 block" data-testid="caixa-msg-venda-ok">
          {mensagem}
        </span>
      </div>
    )
  }

  const isError = kind === 'error'
  const Icon = isError ? AlertCircle : AlertTriangle

  return (
    <div
      className={isError ? classesError : classesWarning}
      role="alert"
      aria-live="assertive"
      data-testid="caixa-status"
    >
      <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <span>{mensagem}</span>
        {hint && (
          <span
            className="mt-0.5 block text-xs font-normal opacity-90"
            data-testid="caixa-status-hint"
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
