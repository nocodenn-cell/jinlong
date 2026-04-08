// Supabase Edge Function: sync-outbox
// Recebe eventos do PDV local (outbox) e persiste no Postgres.
// Segurança (MVP): segredo compartilhado X-SYNC-KEY + service role no ambiente da Function.
//
// Contrato do body: { events: { id, tipo, payload_json, created_at }[] }
// Resposta: { ok, processed, failed }

import { createClient } from "@supabase/supabase-js";

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

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Comparação em tempo constante (evita leak por timing no X-SYNC-KEY). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

const MAX_EVENTS_PER_REQUEST = 200;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const NONCE_TTL_SECONDS = 10 * 60;

function hexOfBytes(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return hexOfBytes(new Uint8Array(signature));
}

function buildSignaturePayload(
  ts: string,
  nonce: string,
  body: string,
): string {
  return `${ts}.${nonce}.${body}`;
}

/** Valida o body HTTP e normaliza `created_at` ausente. */
function parseSyncRequest(raw: unknown): SyncRequest {
  if (!isRecord(raw) || !Array.isArray(raw.events)) {
    throw new Error("INVALID_BODY");
  }
  if (raw.events.length > MAX_EVENTS_PER_REQUEST) {
    throw new Error(`TOO_MANY_EVENTS: máximo ${MAX_EVENTS_PER_REQUEST}`);
  }
  const events: OutboxEvent[] = [];
  for (const item of raw.events) {
    if (!isRecord(item)) throw new Error("INVALID_EVENT");
    const { id, tipo, payload_json, created_at } = item;
    if (typeof id !== "string" || typeof tipo !== "string" ||
      typeof payload_json !== "string") {
      throw new Error("INVALID_EVENT_FIELDS");
    }
    events.push({
      id,
      tipo,
      payload_json,
      created_at: typeof created_at === "string" ? created_at : "",
    });
  }
  return { events };
}

type VendaItemPayload = {
  item_id?: string;
  produto_id: string;
  nome?: string;
  quantidade: number;
  preco_original: number;
  preco_unitario: number;
};

type VendaPayload = {
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
  desconto_gerente_token?: string | null;
  gerente_id?: string | null;
  itens: VendaItemPayload[];
};

function parseVendaPayload(raw: unknown): VendaPayload {
  if (!isRecord(raw)) throw new Error("PAYLOAD_VENDA_INVALIDO");

  const venda_id = raw.venda_id;
  if (typeof venda_id !== "string" || !isUuid(venda_id)) {
    throw new Error("PAYLOAD_VENDA_ID_INVALIDO");
  }

  const forma_pagamento = raw.forma_pagamento;
  if (typeof forma_pagamento !== "string" || !forma_pagamento.trim()) {
    throw new Error("PAYLOAD_FORMA_PAGAMENTO_INVALIDA");
  }

  for (const key of ["total_bruto", "total_desconto", "total_liquido"] as const) {
    const v = raw[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`PAYLOAD_TOTAL_INVALIDO:${key}`);
    }
  }

  const itensRaw = raw.itens;
  if (!Array.isArray(itensRaw) || itensRaw.length === 0) {
    throw new Error("ERRO_VENDA_SEM_ITENS: payload.itens vazio");
  }

  const itens: VendaItemPayload[] = [];
  for (const it of itensRaw) {
    if (!isRecord(it)) throw new Error("ITEM_VENDA_INVALIDO");
    const produto_id = it.produto_id;
    if (typeof produto_id !== "string" || !isUuid(produto_id)) {
      throw new Error("ITEM_PRODUTO_ID_INVALIDO");
    }
    const quantidade = Number(it.quantidade);
    const preco_original = Number(it.preco_original);
    const preco_unitario = Number(it.preco_unitario);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error("ITEM_QUANTIDADE_INVALIDA");
    }
    if (!Number.isFinite(preco_original) || !Number.isFinite(preco_unitario)) {
      throw new Error("ITEM_PRECO_INVALIDO");
    }
    const nome = it.nome;
    const item_id = it.item_id;
    const item: VendaItemPayload = {
      produto_id,
      quantidade,
      preco_original,
      preco_unitario,
    };
    if (typeof nome === "string") item.nome = nome;
    if (typeof item_id === "string" && isUuid(item_id)) item.item_id = item_id;
    itens.push(item);
  }

  const payload: VendaPayload = {
    venda_id,
    forma_pagamento: forma_pagamento.trim(),
    total_bruto: raw.total_bruto as number,
    total_desconto: raw.total_desconto as number,
    total_liquido: raw.total_liquido as number,
    itens,
  };

  if ("caixa_id" in raw) {
    const caixa_id = raw.caixa_id;
    if (caixa_id === null) payload.caixa_id = null;
    else if (typeof caixa_id === "string") payload.caixa_id = caixa_id;
    else throw new Error("PAYLOAD_CAIXA_ID_INVALIDO");
  }
  if ("operador_id" in raw) {
    const operador_id = raw.operador_id;
    if (operador_id === null) payload.operador_id = null;
    else if (typeof operador_id === "string") payload.operador_id = operador_id;
    else throw new Error("PAYLOAD_OPERADOR_ID_INVALIDO");
  }

  const troco = raw.troco_inicial_caixa;
  if (troco === null || troco === undefined) {
    payload.troco_inicial_caixa = null;
  } else if (typeof troco === "number" && Number.isFinite(troco)) {
    payload.troco_inicial_caixa = troco;
  } else {
    throw new Error("PAYLOAD_TROCO_CAIXA_INVALIDO");
  }

  const dgPct = raw.desconto_gerente_percentual;
  const dgVal = raw.desconto_gerente_valor;
  if (dgPct != null) {
    if (typeof dgPct !== "number" || !Number.isFinite(dgPct)) {
      throw new Error("PAYLOAD_DESCONTO_GERENTE_INVALIDO");
    }
    payload.desconto_gerente_percentual = dgPct;
  }
  if (dgVal != null) {
    if (typeof dgVal !== "number" || !Number.isFinite(dgVal)) {
      throw new Error("PAYLOAD_DESCONTO_GERENTE_INVALIDO");
    }
    payload.desconto_gerente_valor = dgVal;
  }

  const gerente_id = raw.gerente_id;
  if (gerente_id === null || gerente_id === undefined) {
    payload.gerente_id = null;
  } else if (typeof gerente_id === "string") {
    payload.gerente_id = gerente_id;
  } else {
    throw new Error("PAYLOAD_GERENTE_ID_INVALIDO");
  }

  if ("desconto_gerente_token" in raw) {
    const token = raw.desconto_gerente_token;
    if (token === null || token === undefined) {
      payload.desconto_gerente_token = null;
    } else if (typeof token === "string" && token.trim()) {
      payload.desconto_gerente_token = token.trim();
    } else {
      throw new Error("PAYLOAD_DESCONTO_GERENTE_TOKEN_INVALIDO");
    }
  }

  return payload;
}

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

function parseCsvLowerSet(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

function shouldUseUnifiedSalesFlow(deviceFingerprint: string | null | undefined): boolean {
  if (Deno.env.get("USE_UNIFIED_SALES_FLOW") === "true") return true;
  const canarySet = parseCsvLowerSet(Deno.env.get("CANARY_DEVICE_FINGERPRINTS"));
  const device = (deviceFingerprint ?? "").trim().toLowerCase();
  return !!device && canarySet.has(device);
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
  const row: {
    id: string;
    caixa_id: string;
    tipo: string;
    valor: number;
    observacao: string | null;
    created_at?: string;
  } = {
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
  const errosEstoque: string[] = [];

  for (const i of itens ?? []) {
    if (!isUuid(i.produto_id)) continue;
    const qty = Number(i.quantidade);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    // Usa a nova RPC segura com controle de concorrência
    const { data: estoqueResult, error: rpcErr } = await supabase.rpc(
      "decrementar_estoque_seguro",
      {
        p_produto_id: i.produto_id.trim(),
        p_quantidade: qty,
        p_venda_id: vendaId,
      },
    );

    if (rpcErr) {
      const erroMsg = `Produto ${i.produto_id}: ${rpcErr.message}`;
      errosEstoque.push(erroMsg);
      logJson({
        level: "error",
        stage: "rpc_estoque",
        event: "decrementar_estoque_seguro",
        venda_id: vendaId,
        produto_id: i.produto_id,
        error: rpcErr.message,
      });
      continue;
    }

    // Verifica resultado da RPC
    if (!estoqueResult || !Array.isArray(estoqueResult) || estoqueResult.length === 0) {
      const erroMsg = `Produto ${i.produto_id}: resposta inválida do servidor`;
      errosEstoque.push(erroMsg);
      logJson({
        level: "error",
        stage: "rpc_estoque",
        event: "decrementar_estoque_seguro",
        venda_id: vendaId,
        produto_id: i.produto_id,
        error: "resposta_invalida",
      });
      continue;
    }

    const result = estoqueResult[0] as {
      sucesso: boolean;
      mensagem: string;
      estoque_atual: number | null;
    };

    if (!result.sucesso) {
      const erroMsg = `Produto ${i.produto_id}: ${result.mensagem}`;
      errosEstoque.push(erroMsg);
      logJson({
        level: "error",
        stage: "rpc_estoque",
        event: "decrementar_estoque_seguro",
        venda_id: vendaId,
        produto_id: i.produto_id,
        mensagem: result.mensagem,
        estoque_atual: result.estoque_atual,
      });
    }
  }

  // Se houver erros críticos de estoque, lança exceção para falhar o sync
  // (exceto BAIXA_JA_EXISTE que é idempotente)
  const errosCriticos = errosEstoque.filter(
    (e) => !e.includes("BAIXA_JA_EXISTE")
  );
  if (errosCriticos.length > 0) {
    throw new Error(`ERRO_ESTOQUE: ${errosCriticos.join("; ")}`);
  }
}

async function processVenda(
  supabase: SupabaseAdmin,
  ev: OutboxEvent,
  useUnifiedSalesFlow: boolean,
) {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(ev.payload_json);
  } catch {
    throw new Error("PAYLOAD_VENDA_JSON_INVALIDO");
  }
  const payload = parseVendaPayload(parsedJson);
  const strictManagerDiscountAuth = Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH") === "true";

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

  const hasManagerDiscount = (payload.desconto_gerente_percentual ?? 0) > 0 ||
    (payload.desconto_gerente_valor ?? 0) > 0;
  if (strictManagerDiscountAuth && hasManagerDiscount && !payload.desconto_gerente_token) {
    throw new Error("GERENTE_TOKEN_OBRIGATORIO");
  }

  if (useUnifiedSalesFlow) {
    logJson({
      level: "info",
      stage: "venda_flow",
      flow: "unified_v2",
      venda_id: payload.venda_id,
    });
    const itensCanonicos = (payload.itens ?? []).map((i) => ({
      item_id: i.item_id,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_original: i.preco_original,
      preco_unitario: i.preco_unitario,
      tipo_preco: i.preco_unitario < i.preco_original ? "ATACADO" : "VAREJO",
    }));

    const { error: rpcUnifiedErr } = await supabase.rpc("finalizar_venda_transacional_canonica_v2", {
      p_venda_id: payload.venda_id,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_forma_pagamento: payload.forma_pagamento,
      p_total_bruto: payload.total_bruto,
      p_total_desconto: payload.total_desconto,
      p_total_liquido: payload.total_liquido,
      p_itens: itensCanonicos,
      p_desconto_gerente_token: payload.desconto_gerente_token ?? null,
      p_desconto_gerente_percentual: payload.desconto_gerente_percentual ?? null,
      p_strict_manager_discount_auth: strictManagerDiscountAuth,
    });

    if (rpcUnifiedErr) {
      logJson({
        level: "error",
        stage: "rpc_finalizar_venda_transacional_canonica_v2",
        venda_id: payload.venda_id,
        error: rpcUnifiedErr.message,
      });
      throw new Error(`ERRO_RPC_FINALIZAR_VENDA_CANONICA: ${rpcUnifiedErr.message}`);
    }
    return;
  }

  logJson({
    level: "info",
    stage: "venda_flow",
    flow: "legacy_registrar_venda_com_itens",
    venda_id: payload.venda_id,
  });

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

function getSupabaseAdminClient() {
  const syncKey = Deno.env.get("SYNC_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!syncKey || !supabaseUrl || !serviceRole) {
    return null;
  }
  return {
    syncKey,
    supabase: createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    }),
  };
}

async function persistNonce(
  supabase: SupabaseAdmin,
  nonce: string,
  deviceFingerprint: string,
  requestTs: number,
): Promise<boolean> {
  // Limpeza oportunista para manter tabela pequena sem job dedicado.
  if (Math.random() < 0.03) {
    const nowIso = new Date().toISOString();
    await supabase.from("sync_request_nonces").delete().lt("expires_at", nowIso);
  }

  const expiresAt = new Date((requestTs + NONCE_TTL_SECONDS) * 1000).toISOString();
  const { error } = await supabase.from("sync_request_nonces").insert({
    nonce,
    device_fingerprint: deviceFingerprint,
    request_ts: requestTs,
    expires_at: expiresAt,
  });
  if (!error) return true;
  const msg = String(error.message ?? "");
  if (error.code === "23505" || msg.includes("duplicate key")) {
    return false;
  }
  throw new Error(`ERRO_NONCE_PERSIST: ${msg}`);
}

async function authorizeSync(
  req: Request,
  syncKey: string,
  supabase: SupabaseAdmin,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gotKey = req.headers.get("X-SYNC-KEY");
  const ts = req.headers.get("X-SYNC-TS");
  const nonce = req.headers.get("X-SYNC-NONCE");
  const signature = req.headers.get("X-SYNC-SIGNATURE");
  const device = req.headers.get("x-device-fingerprint") ?? "unknown-device";

  if (!gotKey || !timingSafeEqualStr(gotKey, syncKey)) {
    return { ok: false, error: "UNAUTHORIZED" };
  }
  if (!ts || !nonce || !signature) {
    return { ok: false, error: "MISSING_SIGNATURE_HEADERS" };
  }
  if (!isUuid(nonce)) {
    return { ok: false, error: "INVALID_NONCE" };
  }
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, error: "INVALID_TIMESTAMP" };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: "TIMESTAMP_OUT_OF_WINDOW" };
  }

  const payload = buildSignaturePayload(
    ts,
    nonce,
    rawBody,
  );
  const expectedSig = await hmacSha256Hex(syncKey, payload);
  if (!timingSafeEqualStr(signature.toLowerCase(), expectedSig.toLowerCase())) {
    return { ok: false, error: "INVALID_SIGNATURE" };
  }

  const nonceAccepted = await persistNonce(supabase, nonce, device, tsNum);
  if (!nonceAccepted) {
    return { ok: false, error: "REPLAY_DETECTED" };
  }

  return { ok: true };
}

async function handleCatalogoSync(supabase: SupabaseAdmin) {
  const [produtosRes, regrasRes] = await Promise.all([
    supabase
      .from("produtos")
      .select("id,nome,codigo_barras,preco_varejo,categoria_id,ativo,origem,tem_nf")
      .order("nome", { ascending: true })
      .limit(100000),
    supabase
      .from("regras_preco")
      .select(
        "id,tipo_regra,produto_id,categoria_id,quantidade_minima,quantidade_maxima,tipo_desconto,valor_desconto,data_validade,ativo",
      )
      .eq("ativo", true)
      .limit(100000),
  ]);

  if (produtosRes.error) {
    throw new Error(`ERRO_CATALOGO_PRODUTOS: ${produtosRes.error.message}`);
  }
  if (regrasRes.error) {
    throw new Error(`ERRO_CATALOGO_REGRAS: ${regrasRes.error.message}`);
  }

  return jsonResponse(200, {
    ok: true,
    produtos: produtosRes.data ?? [],
    regras: regrasRes.data ?? [],
  });
}

async function handlePdvConfigSync(supabase: SupabaseAdmin) {
  const { data, error, status } = await supabase
    .from("pdv_config")
    .select("gerente_id,gerente_senha_sha256,max_desconto_gerente_percentual")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (status === 404 || status === 400) {
      return jsonResponse(200, { ok: true, config: null });
    }
    throw new Error(`ERRO_PDV_CONFIG: ${error.message}`);
  }

  return jsonResponse(200, { ok: true, config: data ?? null });
}

async function handleOutboxBatch(
  supabase: SupabaseAdmin,
  rawBody: string,
  deviceFingerprint: string | null,
) {
  let body: SyncRequest;
  try {
    body = parseSyncRequest(JSON.parse(rawBody));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logJson({ level: "warn", stage: "body", error: msg });
    return jsonResponse(400, {
      ok: false,
      error: "INVALID_REQUEST",
      detail: msg,
    });
  }

  const batchSize = body.events?.length ?? 0;
  const useUnifiedForBatch = shouldUseUnifiedSalesFlow(deviceFingerprint);
  logJson({ level: "info", stage: "batch_start", event_count: batchSize });
  logJson({
    level: "info",
    stage: "batch_flags",
    use_unified_sales_flow: useUnifiedForBatch,
    device_fingerprint: (deviceFingerprint ?? "unknown").slice(0, 200),
  });

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
          await processVenda(supabase, ev, useUnifiedForBatch);
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
}

Deno.serve(async (req) => {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logJson({ level: "error", stage: "env", error: "MISSING_SUPABASE_ENV" });
    return jsonResponse(500, {
      ok: false,
      error: "MISSING_SUPABASE_ENV",
    });
  }

  const url = new URL(req.url);
  const op = url.searchParams.get("op");
  const deviceFingerprint = req.headers.get("x-device-fingerprint");
  const rawBody = req.method === "POST" ? await req.text() : "";

  const auth = await authorizeSync(req, admin.syncKey, admin.supabase, rawBody);
  if (!auth.ok) {
    logJson({
      level: "warn",
      stage: "auth",
      error: auth.error,
      op,
    });
    return jsonResponse(401, { ok: false, error: auth.error });
  }

  try {
    if (req.method === "GET" && op === "catalogo") {
      return await handleCatalogoSync(admin.supabase);
    }
    if (req.method === "GET" && op === "pdv_config") {
      return await handlePdvConfigSync(admin.supabase);
    }
    if (req.method === "POST") {
      return await handleOutboxBatch(admin.supabase, rawBody, deviceFingerprint);
    }
    logJson({ level: "warn", stage: "http", error: "METHOD_NOT_ALLOWED", op });
    return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logJson({ level: "error", stage: "runtime", op, error: err });
    return jsonResponse(500, { ok: false, error: err });
  }
});
