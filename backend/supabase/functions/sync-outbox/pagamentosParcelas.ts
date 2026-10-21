/**
 * Parcelas do crédito no payload da outbox (migration 20261021120000).
 * Campo opcional `parcelas` por pagamento: inteiro 1..24, só CARTAO_CREDITO pode ser > 1.
 * A edge só troca para a RPC v2 (index.ts) quando há parcelas > 1 — assim continua
 * funcionando contra um banco ainda sem a migration para todo o tráfego 1x.
 */
export type PagamentoComParcelas = { forma_pagamento: string; valor: number; parcelas?: number };

export function parseParcelasOpcional(p: Record<string, unknown>, forma: string): number | undefined {
  if (!("parcelas" in p) || p.parcelas == null) return undefined;
  const n = p.parcelas;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 24) {
    throw new Error("PAYLOAD_PAGAMENTOS_INVALIDO");
  }
  if (n > 1 && forma.toUpperCase() !== "CARTAO_CREDITO") throw new Error("PAYLOAD_PAGAMENTOS_INVALIDO");
  return n;
}

export function temParcelamento(pagamentos: readonly PagamentoComParcelas[] | null | undefined): boolean {
  return (pagamentos ?? []).some((p) => (p.parcelas ?? 1) > 1);
}
