// Gating por plano no sync-outbox (sprint cobrança).
//
// Este gate (recursos do plano) só bloqueia COMEÇAR operação nova: abrir caixa sem o recurso `pdv`
// (trial expirado, suspensa, cancelada após o período). Fechamento, sangria/suprimento e venda não
// são recusados AQUI.
//
// Atenção — venda offline com a empresa SUSPENSA: a suspensão grava `vendas_suspensas = true` e o
// trigger de vendas (trg_fn_vendas_caixa_aberto) recusa QUALQUER INSERT em vendas, inclusive o replay
// do sync (VENDAS_SUSPENSAS). A venda não se perde: fica na outbox do PDV com retry/backoff (até
// OUTBOX_MAX_SYNC_FAILURES, padrão 12 ≈ 4 h) e depois na DLQ local, reprocessável; após a reativação
// (pagamento) o replay é aceito. Coberto em backend/scripts/cobranca-planos-trial.test.mjs.
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
