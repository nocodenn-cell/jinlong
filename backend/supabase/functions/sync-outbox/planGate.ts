// Gating por plano no sync-outbox (sprint cobrança).
//
// Este gate (recursos do plano) só bloqueia COMEÇAR operação nova: abrir caixa sem o recurso `pdv`
// (trial expirado, suspensa, cancelada após o período). Fechamento, sangria/suprimento e venda não
// são recusados AQUI.
//
// Venda offline com a empresa SUSPENSA pela cobrança: o trigger de vendas recusa (VENDAS_SUSPENSAS),
// EXCETO venda liberada por `cobranca_liberar_venda_offline` (migration 20261020110000): feita antes da
// suspensão, dentro da validade da autorização offline do dispositivo e enviada logo após o PDV saber
// da suspensão. Fora disso fica na outbox do PDV (retry/backoff → DLQ local) e entra após a reativação.
// Suspensão manual do gerente não tem exceção.
//
// `recursos === null` ⇒ empresa sem assinatura (cliente 1 / legado) ⇒ tudo liberado.

export type GateResultado = { ok: true } | { ok: false; error: string };

export function avaliarEventoNoPlano(tipo: string, recursos: string[] | null): GateResultado {
  if (recursos === null) return { ok: true };
  if (tipo === "CAIXA_ABERTO" && !recursos.includes("pdv")) {
    return { ok: false, error: "ASSINATURA_SEM_PDV" };
  }
  return { ok: true };
}
