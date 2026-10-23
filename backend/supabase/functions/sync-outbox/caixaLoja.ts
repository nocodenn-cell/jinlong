const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CaixaSyncInsert = {
  id: string;
  operador_id: string | null;
  valor_inicial: number;
  status: "ABERTO";
  loja_id: string;
};

export function requireExplicitLojaId(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw.trim())) {
    throw new Error("CAIXA_LOJA_OBRIGATORIA");
  }
  return raw.trim();
}

export function assertMesmaLoja(existente: string | null, informada: string): void {
  if (existente == null || existente !== informada) {
    throw new Error("CAIXA_LOJA_DIVERGENTE");
  }
}

export function caixaInsertForLoja(input: {
  id: string;
  operadorId: string | null;
  valorInicial: number;
  lojaId: unknown;
}): CaixaSyncInsert {
  return {
    id: input.id,
    operador_id: input.operadorId,
    valor_inicial: input.valorInicial,
    status: "ABERTO",
    loja_id: requireExplicitLojaId(input.lojaId),
  };
}

// ---------------------------------------------------------------------------------------------
// Compatibilidade com PDV legado (Build A: anterior a 10/10, não envia loja_id) — SÓ modo legado
// (chave compartilhada, HMAC já validado). Resolve a loja NO SERVIDOR, de forma determinística:
//   1. loja do caixa já existente no servidor (caixa aberto antes, por qualquer build);
//   2. senão, a ÚNICA loja ativa. Com 0 ou >1 lojas ativas o evento é REJEITADO (sem adivinhar).
// `pdv_config` não entra: é singleton global (não é por dispositivo) e com >1 loja seria palpite.
// Header x-loja-id, se veio, só pode confirmar a loja resolvida. Builds B/C (loja_id presente) e o
// modo dispositivo não passam por aqui.
export type LojaLegadoLookups = {
  caixaLoja: (caixaId: string) => Promise<string | null>;
  lojasAtivas: () => Promise<string[]>;
};
export type LojaLegadoAuditoria = { fonte: "caixa" | "loja_unica"; loja_id: string; caixa_id: string | null };

export async function aplicarLojaLegado<E extends { tipo: string; payload_json: string }>(
  ev: E,
  headerLojaId: string | null,
  lookups: LojaLegadoLookups,
): Promise<{ ev: E; auditoria: LojaLegadoAuditoria | null }> {
  if (ev.tipo !== "CAIXA_ABERTO" && ev.tipo !== "VENDA_REGISTRADA") return { ev, auditoria: null };
  const p = JSON.parse(ev.payload_json) as Record<string, unknown>;
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ev, auditoria: null };
  if (p.loja_id !== undefined && p.loja_id !== null && p.loja_id !== "") return { ev, auditoria: null };
  const rawCaixa = ev.tipo === "CAIXA_ABERTO" ? p.id : p.caixa_id;
  const caixaId = typeof rawCaixa === "string" && UUID_RE.test(rawCaixa.trim()) ? rawCaixa.trim() : null;
  let loja = caixaId ? await lookups.caixaLoja(caixaId) : null;
  let fonte: LojaLegadoAuditoria["fonte"] = "caixa";
  if (!loja) {
    const ativas = [...new Set(await lookups.lojasAtivas())];
    if (ativas.length !== 1) throw new Error(ativas.length === 0 ? "LOJA_LEGADO_INDEFINIDA" : "LOJA_LEGADO_AMBIGUA");
    loja = ativas[0];
    fonte = "loja_unica";
  }
  const header = headerLojaId?.trim() || null;
  if (header && header !== loja) throw new Error("LOJA_LEGADO_DIVERGENTE_DO_HEADER");
  return {
    ev: { ...ev, payload_json: JSON.stringify({ ...p, loja_id: loja }) },
    auditoria: { fonte, loja_id: loja, caixa_id: caixaId },
  };
}
