// @ts-nocheck
// Supabase Edge Function: sync-outbox
// Recebe eventos do PDV local (outbox) e persiste no Postgres.
// Segurança (MVP): segredo compartilhado X-SYNC-KEY + service role no ambiente da Function.
//
// Contrato do body: { events: { id, tipo, payload_json, created_at }[] }
// Resposta: { ok, processed, failed }

// @ts-ignore - Import via URL for Deno/Supabase Edge Runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type OutboxEvent = {
  id: string;
  tipo: string;
  payload_json: string;
  created_at: string;
};

type SyncRequest = {
  events: OutboxEvent[];
};

type SyncResponse = {
  ok: boolean;
  processed: string[];
  failed: { id: string; error: string }[];
};

/** Log estruturado (uma linha JSON) para observabilidade em runtime Deno. */
function logJson(payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), svc: "sync-outbox", ...payload }),
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/** UUID v4 (aceita também variantes 1–5 do RFC). */
function isUuid(s: string | null | undefined): s is string {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    t,
  );
}

type SupabaseAdmin = ReturnType<typeof createClient>;

/**
 * Garante linha em `public.caixas` com o mesmo id da sessão do PDV local
 * (idempotente: se já existir, não altera).
 */
async function ensureCaixaPdv(
  supabase: SupabaseAdmin,
  caixaId: string | null | undefined,
  operadorId: string | null | undefined,
  trocoInicial: number | null | undefined,
) {
  if (!isUuid(caixaId)) return;

  const valorInicial =
    trocoInicial != null && Number.isFinite(trocoInicial) ? trocoInicial : 0;
  const op = isUuid(operadorId) ? operadorId.trim() : null;

  const { data: row, error: selErr } = await supabase
    .from("caixas")
    .select("id")
    .eq("id", caixaId.trim())
    .maybeSingle();

  if (selErr) throw new Error(`ERRO_CAIXA_LOOKUP: ${selErr.message}`);
  if (row) return;

  const { error: insErr } = await supabase.from("caixas").insert({
    id: caixaId.trim(),
    operador_id: op,
    valor_inicial: valorInicial,
    status: "ABERTO",
  });

  if (insErr && !String(insErr.message).includes("duplicate key")) {
    throw new Error(`ERRO_CAIXA_INSERT: ${insErr.message}`);
  }
}

async function processCaixaAberto(supabase: SupabaseAdmin, ev: OutboxEvent) {
  const p = JSON.parse(ev.payload_json) as {
    id: string;
    operador_id?: string | null;
    data_abertura?: string;
    valor_inicial?: number;
    status?: string;
  };
  const inicial = p.valor_inicial != null && Number.isFinite(p.valor_inicial)
    ? p.valor_inicial
    : 0;
  await ensureCaixaPdv(supabase, p.id, p.operador_id ?? null, inicial);
}

async function processCaixaFechado(supabase: SupabaseAdmin, ev: OutboxEvent) {
  const p = JSON.parse(ev.payload_json) as {
    id: string;
    data_fechamento: string;
    valor_fechamento: number;
  };
  const { error } = await supabase
    .from("caixas")
    .update({
      status: "FECHADO",
      data_fechamento: p.data_fechamento,
      valor_fechamento: p.valor_fechamento,
    })
    .eq("id", p.id)
    .eq("status", "ABERTO");

  if (error) throw new Error(`ERRO_CAIXA_FECHADO: ${error.message}`);
}

async function processMovimentoCaixa(supabase: SupabaseAdmin, ev: OutboxEvent) {
  const p = JSON.parse(ev.payload_json) as {
    id: string;
    caixa_id: string;
    tipo: string;
    valor: number;
    observacao?: string | null;
    created_at?: string;
  };
  if (p.tipo !== "SANGRIA" && p.tipo !== "SUPRIMENTO") {
    throw new Error(`TIPO_MOVIMENTO_INVALIDO: ${p.tipo}`);
  }
  const row: Record<string, unknown> = {
    id: p.id,
    caixa_id: p.caixa_id,
    tipo: p.tipo,
    valor: p.valor,
    observacao: p.observacao ?? null,
  };
  if (p.created_at) row.created_at = p.created_at;

  const { error } = await supabase.from("movimentos_caixa").insert(row);
  if (error && !String(error.message).includes("duplicate key")) {
    throw new Error(`ERRO_MOVIMENTO: ${error.message}`);
  }
}

async function aplicarBaixaEstoquePorItem(
  supabase: SupabaseAdmin,
  vendaId: string,
  itens: Array<{ produto_id: string; quantidade: number }>,
) {
  for (const i of itens ?? []) {
    if (!isUuid(i.produto_id)) continue;
    const qty = Number(i.quantidade);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const { error: rpcErr } = await supabase.rpc(
      "decrementar_estoque_idempotente",
      {
        p_produto_id: i.produto_id.trim(),
        p_quantidade: qty,
        p_venda_id: vendaId,
      },
    );
    if (rpcErr) {
      logJson({
        level: "error",
        stage: "rpc_estoque",
        event: "decrementar_estoque_idempotente",
        venda_id: vendaId,
        produto_id: i.produto_id,
        error: rpcErr.message,
      });
    }
  }
}

async function processVenda(supabase: SupabaseAdmin, ev: OutboxEvent) {
  const payload = JSON.parse(ev.payload_json) as {
    venda_id: string;
    caixa_id?: string | null;
    operador_id?: string | null;
    troco_inicial_caixa?: number | null;
    forma_pagamento: string;
    total_bruto: number;
    total_desconto: number;
    total_liquido: number;
    desconto_gerente_percentual?: number | null;
    desconto_gerente_valor?: number | null;
    gerente_id?: string | null;
    itens: Array<{
      item_id?: string;
      produto_id: string;
      nome: string;
      quantidade: number;
      preco_original: number;
      preco_unitario: number;
    }>;
  };

  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    throw new Error("ERRO_VENDA_SEM_ITENS: payload.itens vazio");
  }

  await ensureCaixaPdv(
    supabase,
    payload.caixa_id,
    payload.operador_id,
    payload.troco_inicial_caixa ?? null,
  );

  const caixaId = isUuid(payload.caixa_id) ? String(payload.caixa_id).trim() : null;
  const operadorId = isUuid(payload.operador_id)
    ? String(payload.operador_id).trim()
    : null;

  const { error: rpcVendaErr } = await supabase.rpc("registrar_venda_com_itens", {
    p_venda_id: payload.venda_id,
    p_caixa_id: caixaId,
    p_operador_id: operadorId,
    p_forma_pagamento: payload.forma_pagamento,
    p_total_bruto: payload.total_bruto,
    p_total_desconto: payload.total_desconto,
    p_total_liquido: payload.total_liquido,
    p_itens: payload.itens ?? [],
    p_desconto_gerente_percentual: payload.desconto_gerente_percentual ?? null,
    p_desconto_gerente_valor: payload.desconto_gerente_valor ?? null,
    p_gerente_id: payload.gerente_id ?? null,
  });

  if (rpcVendaErr) {
    logJson({
      level: "error",
      stage: "rpc_registrar_venda_com_itens",
      venda_id: payload.venda_id,
      error: rpcVendaErr.message,
    });
    throw new Error(`ERRO_RPC_REGISTRAR_VENDA: ${rpcVendaErr.message}`);
  }

  await aplicarBaixaEstoquePorItem(
    supabase,
    payload.venda_id,
    (payload.itens ?? []).map((i) => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
    })),
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    logJson({ level: "warn", stage: "http", error: "METHOD_NOT_ALLOWED" });
    return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const syncKey = Deno.env.get("SYNC_KEY");
  const gotKey = req.headers.get("X-SYNC-KEY");
  if (!syncKey || !gotKey || gotKey !== syncKey) {
    logJson({
      level: "warn",
      stage: "auth",
      error: "UNAUTHORIZED",
      hint: "SYNC_KEY ausente ou divergente",
    });
    return jsonResponse(401, { ok: false, error: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    logJson({ level: "error", stage: "env", error: "MISSING_SUPABASE_ENV" });
    return jsonResponse(500, {
      ok: false,
      error: "MISSING_SUPABASE_ENV",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  let body: SyncRequest;
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    logJson({ level: "warn", stage: "body", error: "INVALID_JSON" });
    return jsonResponse(400, { ok: false, error: "INVALID_JSON" });
  }

  const batchSize = body.events?.length ?? 0;
  logJson({ level: "info", stage: "batch_start", event_count: batchSize });

  const processed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const ev of body.events ?? []) {
    try {
      logJson({
        level: "info",
        stage: "event_begin",
        event_id: ev.id,
        tipo: ev.tipo,
      });
      switch (ev.tipo) {
        case "VENDA_REGISTRADA":
          await processVenda(supabase, ev);
          break;
        case "CAIXA_ABERTO":
          await processCaixaAberto(supabase, ev);
          break;
        case "CAIXA_FECHADO":
          await processCaixaFechado(supabase, ev);
          break;
        case "MOVIMENTO_CAIXA":
          await processMovimentoCaixa(supabase, ev);
          break;
        default:
          throw new Error(`TIPO_DESCONHECIDO: ${ev.tipo}`);
      }
      processed.push(ev.id);
      logJson({
        level: "info",
        stage: "event_ok",
        event_id: ev.id,
        tipo: ev.tipo,
      });
    } catch (e) {
      const err = String(e);
      failed.push({ id: ev.id, error: err });
      logJson({
        level: "error",
        stage: "event_failed",
        event_id: ev.id,
        tipo: ev.tipo,
        error: err,
      });
    }
  }

  logJson({
    level: "info",
    stage: "batch_done",
    processed: processed.length,
    failed: failed.length,
  });

  const resp: SyncResponse = { ok: true, processed, failed };
  return jsonResponse(200, resp);
});
