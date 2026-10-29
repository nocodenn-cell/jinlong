// Decisão por evento operacional do sync-outbox (20261028130000): quem fez a operação ainda pode operar?
//
// A regra mora no banco (public.sync_avaliar_evento), com evidência só do servidor. Aqui fica a orquestração,
// sem I/O próprio (testável): PROCESSAR ⇒ grava como sempre; RECONCILIAR ⇒ grava e deixa trilha RECONCILIADO_AUTO;
// REVISAO ⇒ NÃO grava, guarda o evento na fila para DONO/GERENTE (o PDV recebe ack, nada se perde);
// REJEITAR ⇒ erro (evento fica no PDV como falha, como hoje). Resposta desconhecida ⇒ falha fechado.

export type AcaoEvento = "PROCESSAR" | "RECONCILIAR" | "REVISAO" | "REJEITAR";
export type DecisaoEvento = {
  acao: AcaoEvento;
  classificacao?: "ANTES_INATIVACAO" | "APOS_INATIVACAO" | "NAO_COMPROVAVEL";
  motivo?: string;
  evidencias?: Record<string, unknown>;
};

const ACOES = new Set<AcaoEvento>(["PROCESSAR", "RECONCILIAR", "REVISAO", "REJEITAR"]);
const CLASSES = new Set(["ANTES_INATIVACAO", "APOS_INATIVACAO", "NAO_COMPROVAVEL"]);

export function parseDecisao(raw: unknown): DecisaoEvento {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("DECISAO_SYNC_INVALIDA");
  const r = raw as Record<string, unknown>;
  const acao = r.acao as AcaoEvento;
  if (!ACOES.has(acao)) throw new Error("DECISAO_SYNC_INVALIDA");
  if ((acao === "REVISAO" || acao === "RECONCILIAR") && !CLASSES.has(String(r.classificacao))) {
    throw new Error("DECISAO_SYNC_INVALIDA");
  }
  if (acao === "RECONCILIAR" && r.classificacao !== "ANTES_INATIVACAO") throw new Error("DECISAO_SYNC_INVALIDA");
  return {
    acao,
    classificacao: r.classificacao as DecisaoEvento["classificacao"],
    motivo: typeof r.motivo === "string" ? r.motivo : undefined,
    evidencias: r.evidencias && typeof r.evidencias === "object" ? r.evidencias as Record<string, unknown> : undefined,
  };
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Horário que o PDV diz (outbox.created_at). Só serve para PIORAR a classificação, nunca para provar "antes". */
export function horarioDispositivo(createdAt: string | null | undefined): string | null {
  if (!createdAt || typeof createdAt !== "string") return null;
  const t = createdAt.trim();
  // SQLite datetime('now') = "YYYY-MM-DD HH:MM:SS" em UTC
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t) ? `${t.replace(" ", "T")}Z` : t;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export type ResultadoEvento =
  | { resultado: "PROCESSADO" }
  | { resultado: "RECONCILIADO"; classificacao: string }
  | { resultado: "EM_REVISAO"; classificacao: string; motivo: string };

export async function aplicarDecisao(
  decisaoRaw: unknown,
  deps: {
    processar: () => Promise<void>;
    enfileirar: (status: "PENDENTE" | "RECONCILIADO_AUTO", d: DecisaoEvento) => Promise<void>;
  },
): Promise<ResultadoEvento> {
  const d = parseDecisao(decisaoRaw);
  if (d.acao === "REJEITAR") throw new Error(d.motivo || "EVENTO_REJEITADO");
  if (d.acao === "REVISAO") {
    await deps.enfileirar("PENDENTE", d);
    return { resultado: "EM_REVISAO", classificacao: d.classificacao!, motivo: d.motivo ?? "" };
  }
  await deps.processar();
  if (d.acao === "RECONCILIAR") {
    await deps.enfileirar("RECONCILIADO_AUTO", d);
    return { resultado: "RECONCILIADO", classificacao: d.classificacao! };
  }
  return { resultado: "PROCESSADO" };
}
