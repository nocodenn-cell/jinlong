/**
 * Feedback textual do fluxo do caixa (erros, avisos, sucesso de venda).
 * Mantido fora de CaixaPageClient para reduzir ruído na orquestração e facilitar testes E2E por data-testid estáveis.
 */
import { DragonIcon } from '@/components/icons/DragonIcon'

export type CaixaMessageBannerKind = 'error' | 'warning'

export type CaixaMessageBannerProps = {
  mensagem: string | null
  /** Quando true, a mensagem é tratada como sucesso de venda (marcador de teste dedicado). */
  msgVendaOk: boolean
  /** 'error' exibe borda/texto em rose-vermelho (ex.: falha no checkout). Padrão: 'warning' (âmbar). */
  kind?: CaixaMessageBannerKind
  /** Linha secundária com instrução de ação (ex.: "Carrinho preservado — tente novamente."). */
  hint?: string | null
}

const classesError =
  'rounded-md border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-sm font-medium text-rose-200'
const classesWarning =
  'rounded-md border border-amber-500/45 bg-amber-950/25 px-3 py-2 text-sm font-medium text-amber-200'
const classesVendaOk =
  'dragon-decreto-frame dragon-decreto-print relative overflow-hidden rounded-lg border border-emerald-600/60 bg-emerald-950/35 px-3 py-2.5 text-sm font-medium text-emerald-100'

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
        <DragonIcon className="pointer-events-none absolute right-2 top-1/2 h-32 w-32 -translate-y-1/2 text-amber-500/[0.07]" />
        <span className="relative z-10 block" data-testid="caixa-msg-venda-ok">
          {mensagem}
        </span>
      </div>
    )
  }

  const classes = kind === 'error' ? classesError : classesWarning

  return (
    <div
      className={classes}
      role="alert"
      aria-live="assertive"
      data-testid="caixa-status"
    >
      <span>{mensagem}</span>
      {hint && (
        <span
          className={
            kind === 'error'
              ? 'mt-0.5 block text-xs font-normal text-rose-300/80'
              : 'mt-0.5 block text-xs font-normal text-amber-300/80'
          }
          data-testid="caixa-status-hint"
        >
          {hint}
        </span>
      )}
    </div>
  )
}
