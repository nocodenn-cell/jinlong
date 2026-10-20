// Gating por plano no sync-outbox (sprint cobrança).
//
// Regra: dado que JÁ aconteceu no PDV (venda offline, fechamento, sangria/suprimento) NUNCA é recusado
// por plano/assinatura — recusar perderia venda e quebraria o caixa. O que se bloqueia é COMEÇAR
// operação nova: abrir caixa com a assinatura sem o recurso `pdv` (trial expirado, suspensa, cancelada
// após o período). A venda nova também já é barrada no servidor por vendas_suspensas (suspensão
// automática da cobrança grava essa chave).
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
