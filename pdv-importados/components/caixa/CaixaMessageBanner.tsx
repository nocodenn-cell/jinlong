/**
 * Feedback textual do fluxo do caixa (erros, avisos, sucesso de venda).
 * Mantido fora de CaixaPageClient para reduzir ruído na orquestração e facilitar testes E2E por data-testid estáveis.
 */
export type CaixaMessageBannerProps = {
  mensagem: string | null
  /** Quando true, a mensagem é tratada como sucesso de venda (marcador de teste dedicado). */
  msgVendaOk: boolean
}

export function CaixaMessageBanner({ mensagem, msgVendaOk }: CaixaMessageBannerProps) {
  if (!mensagem) return null

  return (
    <div
      className="text-xs text-amber-300"
      role="status"
      aria-live="polite"
      data-testid="caixa-status"
    >
      {msgVendaOk ? <span data-testid="caixa-msg-venda-ok">{mensagem}</span> : mensagem}
    </div>
  )
}
