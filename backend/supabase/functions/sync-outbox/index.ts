// Supabase Edge Function: sync-outbox
// Recebe eventos do PDV local (outbox) e persiste no Postgres.
// Segurança: HMAC (X-SYNC-TS, X-SYNC-NONCE, X-SYNC-SIGNATURE) + X-SYNC-KEY; anti-replay (nonce);
// service role somente no ambiente da Function.

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

function logJson(payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), svc: "sync-outbox", ...payload }),
  );
}

function newRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return hexOfBytes(bytes);
}

function eventCorrelationId(ev: OutboxEvent): string {
  try {
    if (ev.tipo === "VENDA_REGISTRADA") {
      const parsed = JSON.parse(ev.payload_json) as Record<string, unknown>;
      const vendaId = typeof parsed.venda_id === "string" ? parsed.venda_id.trim() : "";
      if (vendaId) return vendaId;
    }
  } catch {
    // noop: fallback abaixo
  }
  return ev.id;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

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

/** PDV desktop: validação de senha do gerente via mesmo canal HMAC do sync (sem JWT). */
const RATE_WINDOW_MS_GERENTE_PDV = 15 * 60 * 1000;
const LOCK_MS_GERENTE_PDV = 15 * 60 * 1000;
const GERENTE_PDV_IP_LIMIT = 20;
const GERENTE_PDV_DEVICE_LIMIT = 10;
const GERENTE_PDV_GLOBAL_LIMIT = 60;
const UNKNOWN_IP_GERENTE = "unknown-ip";
const UNKNOWN_DEVICE_GERENTE = "unknown-device";

type GerentePdvRateCtx = {
  scope: "IP" | "DEVICE" | "GLOBAL";
  identifier: string;
  limit: number;
};

type GerentePdvRateRow = {
  failed_count: number;
  first_attempt_at: string;
  lock_until: string | null;
};

function normalizeGerentePdvId(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized.slice(0, 200) : fallback;
}

function extractClientIpGerentePdv(req: Request): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return normalizeGerentePdvId(cfIp, UNKNOWN_IP_GERENTE);
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return UNKNOWN_IP_GERENTE;
  const firstIp = forwarded.split(",")[0] ?? "";
  return normalizeGerentePdvId(firstIp, UNKNOWN_IP_GERENTE);
}

async function gerentePdvGetRateRow(
  supabase: SupabaseAdmin,
  ctx: GerentePdvRateCtx,
): Promise<GerentePdvRateRow | null> {
  const { data, error } = await supabase
    .from("gerente_auth_rate_limits")
    .select("failed_count, first_attempt_at, lock_until")
    .eq("scope", ctx.scope)
    .eq("identifier", ctx.identifier)
    .maybeSingle();
  if (error) throw new Error(`RATE_LIMIT_READ_FAILED:${ctx.scope}:${error.message}`);
  return data as GerentePdvRateRow | null;
}

function gerentePdvIsLocked(lockUntil: string | null, nowMs: number): boolean {
  if (!lockUntil) return false;
  const lockMs = Date.parse(lockUntil);
  return Number.isFinite(lockMs) && lockMs > nowMs;
}

async function gerentePdvRegisterFailure(
  supabase: SupabaseAdmin,
  ctx: GerentePdvRateCtx,
  row: GerentePdvRateRow | null,
  now: Date,
) {
  const nowMs = now.getTime();
  const firstAttemptMs = row?.first_attempt_at ? Date.parse(row.first_attempt_at) : NaN;
  const insideWindow =
    Number.isFinite(firstAttemptMs) && nowMs - firstAttemptMs <= RATE_WINDOW_MS_GERENTE_PDV;

  const failedCount = insideWindow ? (row?.failed_count ?? 0) + 1 : 1;
  const firstAttemptAt = insideWindow && row?.first_attempt_at
    ? row.first_attempt_at
    : now.toISOString();
  const lockUntil = failedCount >= ctx.limit
    ? new Date(nowMs + LOCK_MS_GERENTE_PDV).toISOString()
    : null;

  const { error } = await supabase.from("gerente_auth_rate_limits").upsert({
    scope: ctx.scope,
    identifier: ctx.identifier,
    failed_count: failedCount,
    first_attempt_at: firstAttemptAt,
    lock_until: lockUntil,
    updated_at: now.toISOString(),
  });
  if (error) throw new Error(`RATE_LIMIT_WRITE_FAILED:${ctx.scope}:${error.message}`);

  return { failedCount, lockUntil, blockedNow: !!lockUntil };
}

async function gerentePdvResetRate(
  supabase: SupabaseAdmin,
  ctx: GerentePdvRateCtx,
  nowIso: string,
) {
  const { error } = await supabase.from("gerente_auth_rate_limits").upsert({
    scope: ctx.scope,
    identifier: ctx.identifier,
    failed_count: 0,
    first_attempt_at: nowIso,
    lock_until: null,
    updated_at: nowIso,
  });
  if (error) throw new Error(`RATE_LIMIT_RESET_FAILED:${ctx.scope}:${error.message}`);
}

function gerentePdvGenerateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexGerentePdv(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return hexOfBytes(new Uint8Array(buf));
}

async function handleValidarGerentePdvSync(
  supabase: SupabaseAdmin,
  rawBody: string,
  req: Request,
  deviceFingerprintHeader: string | null,
): Promise<Response> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { ok: false, error: "INVALID_JSON" });
  }
  if (!isRecord(body)) {
    return jsonResponse(400, { ok: false, error: "INVALID_BODY" });
  }
  const senhaRaw = body.senha;
  if (typeof senhaRaw !== "string" || !senhaRaw.trim()) {
    return jsonResponse(400, { ok: false, error: "SENHA_OBRIGATORIA" });
  }
  const senhaNormalizada = senhaRaw.trim();
  if (senhaNormalizada.length > 128) {
    return jsonResponse(400, { ok: false, error: "SENHA_INVALIDA_FORMATO" });
  }

  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const clientIp = extractClientIpGerentePdv(req);
  const deviceFingerprint = normalizeGerentePdvId(
    deviceFingerprintHeader ?? "",
    UNKNOWN_DEVICE_GERENTE,
  );

  const rateContexts: GerentePdvRateCtx[] = [
    { scope: "IP", identifier: clientIp, limit: GERENTE_PDV_IP_LIMIT },
    { scope: "DEVICE", identifier: deviceFingerprint, limit: GERENTE_PDV_DEVICE_LIMIT },
    { scope: "GLOBAL", identifier: "global", limit: GERENTE_PDV_GLOBAL_LIMIT },
  ];

  try {
    for (const ctx of rateContexts) {
      const row = await gerentePdvGetRateRow(supabase, ctx);
      if (gerentePdvIsLocked(row?.lock_until ?? null, nowMs)) {
        logJson({
          level: "warn",
          stage: "validar_gerente_pdv",
          event: "locked_precheck",
          scope: ctx.scope,
          lock_until: row?.lock_until ?? null,
        });
        return jsonResponse(429, {
          ok: false,
          error: "LOCKED_TEMPORARILY",
          scope: ctx.scope,
          lock_until: row?.lock_until ?? null,
        });
      }
    }

    const { data: config, error: configError } = await supabase
      .from("pdv_config")
      .select("gerente_senha_sha256, max_desconto_gerente_percentual")
      .eq("id", 1)
      .maybeSingle();

    if (configError) {
      logJson({ level: "error", stage: "validar_gerente_pdv", error: configError.message });
      return jsonResponse(500, { ok: false, error: "ERRO_DB_CONFIG" });
    }
    if (!config || !config.gerente_senha_sha256) {
      return jsonResponse(500, { ok: false, error: "CONFIG_NAO_ENCONTRADA" });
    }

    const senhaHash = await sha256HexGerentePdv(senhaNormalizada);
    if (!timingSafeEqualStr(senhaHash, config.gerente_senha_sha256)) {
      let lockScope: GerentePdvRateCtx["scope"] | null = null;
      let lockUntil: string | null = null;
      for (const ctx of rateContexts) {
        const row = await gerentePdvGetRateRow(supabase, ctx);
        const result = await gerentePdvRegisterFailure(supabase, ctx, row, now);
        logJson({
          level: "warn",
          stage: "validar_gerente_pdv",
          event: "failed_attempt",
          scope: ctx.scope,
          failed_count: result.failedCount,
          lock_until: result.lockUntil,
        });
        if (result.blockedNow && !lockScope) {
          lockScope = ctx.scope;
          lockUntil = result.lockUntil;
        }
      }
      if (lockScope && lockUntil) {
        return jsonResponse(429, {
          ok: false,
          error: "LOCKED_TEMPORARILY",
          scope: lockScope,
          lock_until: lockUntil,
        });
      }
      return jsonResponse(401, { ok: false, error: "SENHA_INVALIDA" });
    }

    const token = gerentePdvGenerateToken();
    const expiraEm = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("tokens_desconto_gerente").insert({
      token,
      expira_em: expiraEm,
      usado: false,
      loja_id: null,
      criado_por: null,
    });

    if (insertError) {
      logJson({
        level: "error",
        stage: "validar_gerente_pdv",
        error: insertError.message,
      });
      return jsonResponse(503, {
        ok: false,
        error: "ERRO_PERSISTENCIA_TOKEN",
      });
    }

    for (const ctx of rateContexts) {
      await gerentePdvResetRate(supabase, ctx, nowIso);
    }

    logJson({
      level: "info",
      stage: "validar_gerente_pdv",
      success: true,
      ip: clientIp,
      device: deviceFingerprint,
    });

    const maxPct = Number(config.max_desconto_gerente_percentual);
    return jsonResponse(200, {
      ok: true,
      token,
      expira_em: expiraEm,
      max_desconto_percentual: Number.isFinite(maxPct) && maxPct > 0 ? maxPct : 20,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logJson({ level: "error", stage: "validar_gerente_pdv", error: msg });
    return jsonResponse(500, { ok: false, error: "ERRO_INTERNO" });
  }
}

/**
 * Garante linha em `public.caixas` com o mesmo id da sessão do PDV local
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
  const p = JSON.parse(ev.payload_json);
  const inicial = p.valor_inicial != null && Number.isFinite(p.valor_inicial)
    ? p.valor_inicial
    : 0;
  await ensureCaixaPdv(supabase, p.id, p.operador_id ?? null, inicial);
}

async function processCaixaFechado(supabase: SupabaseAdmin, ev: OutboxEvent) {
  const p = JSON.parse(ev.payload_json);
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
  const p = JSON.parse(ev.payload_json);
  if (p.tipo !== "SANGRIA" && p.tipo !== "SUPRIMENTO") {
    throw new Error(`TIPO_MOVIMENTO_INVALIDO: ${p.tipo}`);
  }
  const row = {
    id: p.id,
    caixa_id: p.caixa_id,
    tipo: p.tipo,
    valor: p.valor,
    observacao: p.observacao ?? null,
    created_at: p.created_at || undefined,
  };

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

    const { data: estoqueResult, error: rpcErr } = await supabase.rpc(
      "decrementar_estoque_seguro",
      {
        p_produto_id: i.produto_id.trim(),
        p_quantidade: qty,
        p_venda_id: vendaId,
      },
    );

    if (rpcErr) {
      errosEstoque.push(`Produto ${i.produto_id}: ${rpcErr.message}`);
      continue;
    }

    if (estoqueResult?.[0] && !estoqueResult[0].sucesso) {
      errosEstoque.push(`Produto ${i.produto_id}: ${estoqueResult[0].mensagem}`);
    }
  }

  const errosCriticos = errosEstoque.filter((e) => !e.includes("BAIXA_JA_EXISTE"));
  if (errosCriticos.length > 0) {
    throw new Error(`ERRO_ESTOQUE: ${errosCriticos.join("; ")}`);
  }
}

async function processVenda(
  supabase: SupabaseAdmin,
  ev: OutboxEvent,
  useUnifiedSalesFlow: boolean,
) {
  const parsedJson = JSON.parse(ev.payload_json);
  const payload = parseVendaPayload(parsedJson);
  const strictManagerDiscountAuth = Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH") === "true";

  await ensureCaixaPdv(
    supabase,
    payload.caixa_id,
    payload.operador_id,
    payload.troco_inicial_caixa ?? null,
  );

  const hasManagerDiscount = (payload.desconto_gerente_percentual ?? 0) > 0 ||
    (payload.desconto_gerente_valor ?? 0) > 0;
  if (strictManagerDiscountAuth && hasManagerDiscount && !payload.desconto_gerente_token) {
    throw new Error("GERENTE_TOKEN_OBRIGATORIO");
  }

  if (useUnifiedSalesFlow) {
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
      p_caixa_id: payload.caixa_id,
      p_operador_id: payload.operador_id,
      p_forma_pagamento: payload.forma_pagamento,
      p_total_bruto: payload.total_bruto,
      p_total_desconto: payload.total_desconto,
      p_total_liquido: payload.total_liquido,
      p_itens: itensCanonicos,
      p_desconto_gerente_token: payload.desconto_gerente_token ?? null,
      p_desconto_gerente_percentual: payload.desconto_gerente_percentual ?? null,
      p_strict_manager_discount_auth: strictManagerDiscountAuth,
    });

    if (rpcUnifiedErr) throw new Error(`ERRO_RPC_FINALIZAR_VENDA: ${rpcUnifiedErr.message}`);
    return;
  }

  const { error: rpcVendaErr } = await supabase.rpc("registrar_venda_com_itens", {
    p_venda_id: payload.venda_id,
    p_caixa_id: payload.caixa_id,
    p_operador_id: payload.operador_id,
    p_forma_pagamento: payload.forma_pagamento,
    p_total_bruto: payload.total_bruto,
    p_total_desconto: payload.total_desconto,
    p_total_liquido: payload.total_liquido,
    p_itens: payload.itens ?? [],
    p_desconto_gerente_percentual: payload.desconto_gerente_percentual ?? null,
    p_desconto_gerente_valor: payload.desconto_gerente_valor ?? null,
    p_gerente_id: payload.gerente_id ?? null,
  });

  if (rpcVendaErr) throw new Error(`ERRO_RPC_REGISTRAR_VENDA: ${rpcVendaErr.message}`);

  await aplicarBaixaEstoquePorItem(
    supabase,
    payload.venda_id,
    (payload.itens ?? []).map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
  );
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
      .select("id,tipo_regra,produto_id,categoria_id,quantidade_minima,quantidade_maxima,tipo_desconto,valor_desconto,data_validade,ativo")
      .eq("ativo", true)
      .limit(100000),
  ]);

  if (produtosRes.error) throw new Error(`ERRO_CATALOGO_PRODUTOS: ${produtosRes.error.message}`);
  if (regrasRes.error) throw new Error(`ERRO_CATALOGO_REGRAS: ${regrasRes.error.message}`);

  return jsonResponse(200, { ok: true, produtos: produtosRes.data ?? [], regras: regrasRes.data ?? [] });
}

/** * 🔒 CORREÇÃO P0: Removido gerente_senha_sha256 do retorno
 */
async function handlePdvConfigSync(supabase: SupabaseAdmin) {
  const { data, error, status } = await supabase
    .from("pdv_config")
    .select("gerente_id, max_desconto_gerente_percentual") // 🔒 Removido campo de senha
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (status === 404 || status === 400) return jsonResponse(200, { ok: true, config: null });
    throw new Error(`ERRO_PDV_CONFIG: ${error.message}`);
  }

  const configComFlag = data ? {
    ...data,
    strict_manager_auth: Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH") === "true"
  } : null;

  return jsonResponse(200, { ok: true, config: configComFlag });
}

async function handleGetByOp(
  op: string | null,
  supabase: SupabaseAdmin,
): Promise<Response | null> {
  if (op === "catalogo") return await handleCatalogoSync(supabase);
  if (op === "pdv_config") return await handlePdvConfigSync(supabase);
  return null;
}

async function dispatchOutboxEvent(
  supabase: SupabaseAdmin,
  ev: OutboxEvent,
  useUnified: boolean,
): Promise<void> {
  if (ev.tipo === "VENDA_REGISTRADA") await processVenda(supabase, ev, useUnified);
  else if (ev.tipo === "CAIXA_ABERTO") await processCaixaAberto(supabase, ev);
  else if (ev.tipo === "CAIXA_FECHADO") await processCaixaFechado(supabase, ev);
  else if (ev.tipo === "MOVIMENTO_CAIXA") await processMovimentoCaixa(supabase, ev);
}

async function handlePostOutboxBatch(
  supabase: SupabaseAdmin,
  rawBody: string,
  req: Request,
  requestId: string,
  reqStart: number,
): Promise<Response> {
  let body: SyncRequest;
  try {
    body = parseSyncRequest(JSON.parse(rawBody));
  } catch {
    return jsonResponse(400, { ok: false, error: "INVALID_JSON", request_id: requestId });
  }

  const processed: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const useUnified = shouldUseUnifiedSalesFlow(req.headers.get("x-device-fingerprint"));
  logJson({
    level: "info",
    stage: "sync_start",
    request_id: requestId,
    use_unified_sales_flow: useUnified,
    event_count: body.events.length,
  });

  for (const ev of body.events) {
    try {
      await dispatchOutboxEvent(supabase, ev, useUnified);
      processed.push(ev.id);
      logJson({
        level: "info",
        stage: "event_processed",
        request_id: requestId,
        event_id: ev.id,
        event_type: ev.tipo,
        correlation_id: eventCorrelationId(ev),
      });
    } catch (e) {
      failed.push({ id: ev.id, error: e instanceof Error ? e.message : String(e) });
      logJson({
        level: "warn",
        stage: "event_failed",
        request_id: requestId,
        event_id: ev.id,
        event_type: ev.tipo,
        correlation_id: eventCorrelationId(ev),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logJson({
    level: "info",
    stage: "sync_end",
    request_id: requestId,
    processed_count: processed.length,
    failed_count: failed.length,
    duration_ms: Date.now() - reqStart,
  });
  return jsonResponse(200, { ok: true, processed, failed, request_id: requestId });
}

Deno.serve(async (req) => {
  const requestId = newRequestId();
  const reqStart = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const url = new URL(req.url);
  const op = url.searchParams.get("op");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const syncKey = Deno.env.get("SYNC_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole);

  const rawBody = req.method === "POST" ? await req.text() : "";
  const auth = await authorizeSync(req, syncKey, supabase, rawBody);
  if (!auth.ok) {
    logJson({
      level: "warn",
      stage: "auth",
      request_id: requestId,
      error: auth.error,
    });
    return jsonResponse(401, { ok: false, error: auth.error, request_id: requestId });
  }

  try {
    if (req.method === "GET") {
      const getRes = await handleGetByOp(op, supabase);
      if (getRes) return getRes;
      return jsonResponse(400, { ok: false, error: "INVALID_OPERATION", request_id: requestId });
    }

    if (req.method === "POST") {
      if (op === "validar_gerente") {
        return await handleValidarGerentePdvSync(
          supabase,
          rawBody,
          req,
          req.headers.get("x-device-fingerprint"),
        );
      }
      return await handlePostOutboxBatch(supabase, rawBody, req, requestId, reqStart);
    }

    return jsonResponse(400, { ok: false, error: "INVALID_OPERATION", request_id: requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logJson({
      level: "error",
      stage: "sync_fatal",
      request_id: requestId,
      error: msg,
      duration_ms: Date.now() - reqStart,
    });
    return jsonResponse(500, {
      ok: false,
      error: "ERRO_INTERNO",
      request_id: requestId,
    });
  }
});

async function authorizeSync(req: Request, syncKey: string, supabase: SupabaseAdmin, rawBody: string) {
  const gotKey = req.headers.get("X-SYNC-KEY");
  const ts = req.headers.get("X-SYNC-TS");
  const nonce = req.headers.get("X-SYNC-NONCE");
  const signature = req.headers.get("X-SYNC-SIGNATURE");
  const device = req.headers.get("x-device-fingerprint") ?? "unknown";

  if (!gotKey || !timingSafeEqualStr(gotKey, syncKey)) return { ok: false, error: "UNAUTHORIZED" };
  if (!ts || !nonce || !signature) return { ok: false, error: "MISSING_HEADERS" };

  const tsNum = Number(ts);
  if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, error: "TS_OUT_OF_WINDOW" };

  const payload = `${ts}.${nonce}.${rawBody}`;
  const expectedSig = await hmacSha256Hex(syncKey, payload);
  if (!timingSafeEqualStr(signature.toLowerCase(), expectedSig.toLowerCase())) return { ok: false, error: "INVALID_SIG" };

  const { error } = await supabase.from("sync_request_nonces").insert({ nonce, device_fingerprint: device, request_ts: tsNum });
  if (error) return { ok: false, error: "REPLAY_OR_DB_ERROR" };

  return { ok: true };
}
