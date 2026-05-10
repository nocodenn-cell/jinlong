import type { Mensagens } from '@/i18n/getMessages'

/** Rotula forma de pagamento persistida como código (ex.: DINHEIRO) para o idioma atual. */
export function labelFormaPagamentoVenda(
  raw: string | null | undefined,
  m: Mensagens,
): string {
  const c = String(raw ?? '').trim().toUpperCase()
  switch (c) {
    case 'DINHEIRO':
      return m.gerente.pagamento_dinheiro
    case 'PIX':
      return m.gerente.pagamento_pix
    case 'CARTAO_DEBITO':
      return m.gerente.forma_cartao_debito
    case 'CARTAO_CREDITO':
      return m.gerente.forma_cartao_credito
    case 'CARTAO':
      return m.gerente.pagamento_cartao
    case 'OUTROS':
    case 'OUTRO':
      return m.gerente.forma_outros
    default:
      return raw && String(raw).trim() ? String(raw).trim() : '—'
  }
}

/** Rotula status de venda persistido como código (ex.: CONCLUIDA). */
export function labelStatusVenda(raw: string | null | undefined, m: Mensagens): string {
  const c = String(raw ?? '').trim().toUpperCase()
  switch (c) {
    case 'CONCLUIDA':
      return m.gerente.venda_status_concluida
    case 'CANCELADA':
      return m.gerente.venda_status_cancelada
    default:
      return raw && String(raw).trim() ? String(raw).trim() : '—'
  }
}
