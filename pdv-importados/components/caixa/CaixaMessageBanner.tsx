/**
 * Feedback textual do fluxo do caixa (erros, avisos, sucesso de venda).
 * Mantido fora de CaixaPageClient para reduzir ruído na orquestração e facilitar testes E2E por data-testid estáveis.
 */
import { DragonIcon } from '@/components/icons/DragonIcon'

export type CaixaMessageBannerProps = {
  mensagem: string | null
  /** Quando true, a mensagem é tratada como sucesso de venda (marcador de teste dedicado). */
  msgVendaOk: boolean
}

export function CaixaMessageBanner({ mensagem, msgVendaOk }: CaixaMessageBannerProps) {
  if (!mensagem) return null

  return (
    <div
      className={
        msgVendaOk
          ? 'dragon-decreto-frame dragon-decreto-print relative overflow-hidden rounded-lg border border-emerald-700/40 bg-emerald-950/25 px-3 py-2.5 text-xs text-emerald-100'
          : 'text-xs text-amber-300'
      }
      role="status"
      aria-live="polite"
      data-testid="caixa-status"
    >
      {msgVendaOk ? (
        <>
          <DragonIcon className="pointer-events-none absolute right-2 top-1/2 h-32 w-32 -translate-y-1/2 text-amber-500/[0.07]" />
          <span className="relative z-10 block" data-testid="caixa-msg-venda-ok">
            {mensagem}
          </span>
        </>
      ) : (
        mensagem
      )}
    </div>
  )
}
