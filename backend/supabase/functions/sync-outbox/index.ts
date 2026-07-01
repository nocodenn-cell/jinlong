// FREEZE: CORE TRANSACIONAL — caller único para registrar_venda_com_itens.
// Não reintroduzir USE_UNIFIED_SALES_FLOW, canary flags ou branches de RPC de venda.
// Ver docs/venda-golden-flow.md para o contrato oficial.
//
// Supabase Edge Function: sync-outbox
// Recebe eventos do PDV local (outbox) e persiste no Postgres.
// Segurança: HMAC (X-SYNC-TS, X-SYNC-NONCE, X-SYNC-SIGNATURE) + X-SYNC-KEY; anti-replay (nonce);
// service role somente no ambiente da Function.
//
// --- Matriz ?op= (após authorizeSync: chave + HMAC + nonce) ---
// | Método | op (query)     | Handler / efeito           | Dados sensíveis na resposta |
// |--------|----------------|----------------------------|-----------------------------|
// | GET    | catalogo       | handleCatalogoSync         | Catálogo completo: produtos (preço, nome, codigo_barras, …) + regras_preco ativas — comercial sensível |
// | GET    | pdv_config     | handlePdvConfigSync        | gerente_id, max_desconto…; strict_manager_auth (sem hash de senha) |
// | GET    | outro/ausente  | —                          | 400 INVALID_OPERATION |
// | POST   | validar_gerente| handleValidarGerentePdvSync| token gerente + expiração (se ok) — token sensível; erros genéricos |
// | POST   | (omitido)      | handlePostOutboxBatch      | processed[], failed[{id,error}], request_id — IDs + mensagens de erro internas |
// |        |                | dispatchOutboxEvent tipos  | Corpo só no POST: VENDA_REGISTRADA (venda+itens), CAIXA_*, MOVIMENTO_CAIXA — persiste no DB; resposta agregada no batch |
// |        |                | pós-venda fiscal (opcional) | Se `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE=true`, chama RPC `fiscal_enfileirar_documento_venda` (erro só em log; não falha o batch) |
// ---

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { timingSafeEqualSecret, timingSafeEqualStr } from "../_shared/crypto.ts";
import { validateGerenteAndIssueToken } from "../_shared/gerente-auth.ts";
import { logJson } from "../../../../shared/logger.ts";
import { maybeEnqueueFiscalDocumentAfterSyncedVenda } from "./fiscal_enqueue_after_venda_sync.ts";
import { captureEdgeException } from "../_shared/sentryEdge.ts";

type OutboxEvent = {
  id: string;
  tipo: string;
  payload_json: string;
  created_at: string;
  // Sequência monotônica por dispositivo — ordem canônica cross-batch do sync.
  // Opcional: clientes antigos (pré-migração) podem não enviar; nesse caso a
  // ordenação cai no fallback determinístico (typePriority).
  event_version?: number;
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

const MAX_EVENTS_PER_REQUEST = 200;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const NONCE_TTL_SECONDS = 10 * 60;
const CORS_ALLOW_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOW_HEADERS =
  "content-type, x-sync-key, x-sync-ts, x-sync-nonce, x-sync-signature, x-device-fingerprint";

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
  deviceFingerprint: string,
  body: string,
): string {
  return `${ts}.${nonce}.${deviceFingerprint}.${body}`;
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
    const { id, tipo, payload_json, created_at, event_version } = item;
    if (typeof id !== "string" || typeof tipo !== "string" ||
      typeof payload_json !== "string") {
      throw new Error("INVALID_EVENT_FIELDS");
    }
    events.push({
      id,
      tipo,
      payload_json,
      created_at: typeof created_at === "string" ? created_at : "",
      event_version:
        typeof event_version === "number" && Number.isFinite(event_version)
          ? event_version
          : undefined,
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

function assertVendaMoneyTotals(raw: Record<string, unknown>): void {
  for (const key of ["total_bruto", "total_desconto", "total_liquido"] as const) {
    const v = raw[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`PAYLOAD_TOTAL_INVALIDO:${key}`);
    }
  }
}

function parseSingleVendaItem(it: unknown): VendaItemPayload {
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
  const item: VendaItemPayload = {
    produto_id,
    quantidade,
    preco_original,
    preco_unitario,
  };
  const nome = it.nome;
  const item_id = it.item_id;
  if (typeof nome === "string") item.nome = nome;
  if (typeof item_id === "string" && isUuid(item_id)) item.item_id = item_id;
  return item;
}

function parseVendaItensOrThrow(itensRaw: unknown): VendaItemPayload[] {
  if (!Array.isArray(itensRaw) || itensRaw.length === 0) {
    throw new Error("ERRO_VENDA_SEM_ITENS: payload.itens vazio");
  }
  return itensRaw.map(parseSingleVendaItem);
}

function setCaixaIdFromPayload(raw: Record<string, unknown>, payload: VendaPayload): void {
  if (!("caixa_id" in raw)) return;
  const caixa_id = raw.caixa_id;
  if (caixa_id === null) payload.caixa_id = null;
  else if (typeof caixa_id === "string") payload.caixa_id = caixa_id.trim();
  else throw new Error("PAYLOAD_CAIXA_ID_INVALIDO");
}

function setOperadorIdFromPayload(raw: Record<string, unknown>, payload: VendaPayload): void {
  if (!("operador_id" in raw)) return;
  const operador_id = raw.operador_id;
  if (operador_id === null) payload.operador_id = null;
  else if (typeof operador_id === "string") payload.operador_id = operador_id.trim();
  else throw new Error("PAYLOAD_OPERADOR_ID_INVALIDO");
}

function setTrocoInicialFromPayload(raw: Record<string, unknown>, payload: VendaPayload): void {
  const troco = raw.troco_inicial_caixa;
  if (troco === null || troco === undefined) {
    payload.troco_inicial_caixa = null;
    return;
  }
  if (typeof troco === "number" && Number.isFinite(troco)) {
    payload.troco_inicial_caixa = troco;
    return;
  }
  throw new Error("PAYLOAD_TROCO_CAIXA_INVALIDO");
}

function setDescontoGerenteFromPayload(raw: Record<string, unknown>, payload: VendaPayload): void {
  const dgPct = raw.desconto_gerente_percentual;
  if (dgPct != null) {
    if (typeof dgPct !== "number" || !Number.isFinite(dgPct)) {
      throw new Error("PAYLOAD_DESCONTO_GERENTE_INVALIDO");
    }
    payload.desconto_gerente_percentual = dgPct;
  }
  const dgVal = raw.desconto_gerente_valor;
  if (dgVal != null) {
    if (typeof dgVal !== "number" || !Number.isFinite(dgVal)) {
      throw new Error("PAYLOAD_DESCONTO_GERENTE_INVALIDO");
    }
    payload.desconto_gerente_valor = dgVal;
  }
}

function setGerenteIdFromPayload(raw: Record<string, unknown>, payload: VendaPayload): void {
  const gerente_id = raw.gerente_id;
  if (gerente_id === null || gerente_id === undefined) {
    payload.gerente_id = null;
    return;
  }
  if (typeof gerente_id === "string") {
    payload.gerente_id = gerente_id;
    return;
  }
  throw new Error("PAYLOAD_GERENTE_ID_INVALIDO");
}

function setDescontoTokenFromPayload(raw: Record<string, unknown>, payload: VendaPayload): void {
  if (!("desconto_gerente_token" in raw)) return;
  const token = raw.desconto_gerente_token;
  if (token === null || token === undefined) {
    payload.desconto_gerente_token = null;
    return;
  }
  if (typeof token === "string" && token.trim()) {
    payload.desconto_gerente_token = token.trim();
    return;
  }
  throw new Error("PAYLOAD_DESCONTO_GERENTE_TOKEN_INVALIDO");
}

function applyVendaOptionalFields(raw: Record<string, unknown>, payload: VendaPayload): void {
  setCaixaIdFromPayload(raw, payload);
  setOperadorIdFromPayload(raw, payload);
  setTrocoInicialFromPayload(raw, payload);
  setDescontoGerenteFromPayload(raw, payload);
  setGerenteIdFromPayload(raw, payload);
  setDescontoTokenFromPayload(raw, payload);
}

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

  assertVendaMoneyTotals(raw);
  const itens = parseVendaItensOrThrow(raw.itens);

  const payload: VendaPayload = {
    venda_id,
    forma_pagamento: forma_pagamento.trim(),
    total_bruto: raw.total_bruto as number,
    total_desconto: raw.total_desconto as number,
    total_liquido: raw.total_liquido as number,
    itens,
  };

  applyVendaOptionalFields(raw, payload);
  return payload;
}

/** Log estruturado */
const log = (payload: Record<string, unknown>) => logJson("sync-outbox", payload);

function shouldExposeInternalErrors(): boolean {
  const raw = (Deno.env.get("SYNC_OUTBOX_EXPOSE_INTERNAL_ERRORS") ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Sem `SYNC_OUTBOX_EXPOSE_INTERNAL_ERRORS`, ainda retornamos códigos estáveis do contrato sync (CI/diagnóstico). */
function authErrorForClientResponse(code: string, exposeAll: boolean): string {
  if (exposeAll) return code;
  if (
    code === "REPLAY_OR_DB_ERROR" ||
    code === "INVALID_SIG" ||
    code === "TS_OUT_OF_WINDOW"
  ) {
    return code;
  }
  return "UNAUTHORIZED";
}

function newRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return hexOfBytes(bytes);
}

/** Uniforme em [0, 1) via Web Crypto; para gatilhos não adivinháveis por atacante (ex.: throttle de manutenção). */
function secureUnitRandom(): number {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return new DataView(buf.buffer).getUint32(0, false) / 0x100000000;
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

function jsonResponse(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(req),
    },
  });
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin?.trim() || "*",
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
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

function parseDeviceKeyMap(raw: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (raw ?? "").split(",")) {
    const [deviceRaw, keyRaw] = part.split("=");
    const device = (deviceRaw ?? "").trim().toLowerCase();
    const key = (keyRaw ?? "").trim();
    if (device && key) map.set(device, key);
  }
  return map;
}

// A Edge usa schema dinâmico do Supabase e o Deno check sem tipos gerados
// produz falsos positivos em `from()/rpc()`. Mantemos o client frouxo aqui.
type SupabaseAdmin = any;

const GERENTE_PDV_IP_LIMIT = 20;
const GERENTE_PDV_DEVICE_LIMIT = 10;
const GERENTE_PDV_GLOBAL_LIMIT = 60;

async function handleValidarGerentePdvSync(
  supabase: SupabaseAdmin,
  rawBody: string,
  req: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(req, 400, { ok: false, error: "INVALID_JSON" });
  }
  if (!isRecord(body)) {
    return jsonResponse(req, 400, { ok: false, error: "INVALID_BODY" });
  }
  const senhaRaw = body.senha;
  if (typeof senhaRaw !== "string" || !senhaRaw.trim()) {
    return jsonResponse(req, 400, { ok: false, error: "SENHA_OBRIGATORIA" });
  }
  const senhaNormalizada = senhaRaw.trim();
  if (senhaNormalizada.length > 128) {
    return jsonResponse(req, 400, { ok: false, error: "SENHA_INVALIDA_FORMATO" });
  }

  const result = await validateGerenteAndIssueToken({
    supabase,
    senha: senhaNormalizada,
    lojaId: null,
    userId: null,
    req,
    logStage: "validar_gerente_pdv",
    log: log,
    limits: {
      ip: GERENTE_PDV_IP_LIMIT,
      device: GERENTE_PDV_DEVICE_LIMIT,
      global: GERENTE_PDV_GLOBAL_LIMIT,
    },
    tokenCreatedBy: null,
    persistAuthAttemptsByUser: false,
  });
  return jsonResponse(req, result.status, result.body);
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

  // Writer único de abertura (Fase 1). Via service_role, com id explícito.
  // A RPC é idempotente no replay (mesmo id → o_ja_aberto=true, sem erro).
  const { error } = await supabase.rpc("abrir_caixa_atomico", {
    p_valor_inicial: valorInicial,
    p_operador_id: op,
    p_caixa_id: caixaId.trim(),
  });

  if (error) {
    throw new Error(`ERRO_CAIXA_ABERTURA: ${error.message}`);
  }
}

async function processCaixaAberto(supabase: SupabaseAdmin, ev: OutboxEvent) {
  const p = JSON.parse(ev.payload_json) as {
    id: string;
    operador_id?: string | null;
    valor_inicial?: number;
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
    fechamento_observacao?: string | null;
  };
  if (!isUuid(p.id)) throw new Error("CAIXA_FECHADO_ID_INVALIDO");
  if (typeof p.data_fechamento !== "string" || !p.data_fechamento) {
    throw new Error("CAIXA_FECHADO_DATA_INVALIDA");
  }

  const valorFechamento =
    typeof p.valor_fechamento === "number" && Number.isFinite(p.valor_fechamento)
      ? p.valor_fechamento
      : 0;

  let fechamentoObs: string | null = null;
  if (typeof p.fechamento_observacao === "string") {
    const t = p.fechamento_observacao.trim();
    if (t.length > 500) throw new Error("CAIXA_FECHADO_OBSERVACAO_LONGA");
    fechamentoObs = t.length > 0 ? t : null;
  }

  // Writer único de fechamento (Fase 1). A RPC é idempotente: caixa já FECHADO
  // retorna o_ja_fechado=true SEM exception → sucesso silencioso, sem retry storm
  // no outbox (at-least-once). Erros reais (id ausente, movimentações pendentes)
  // continuam a re-tentar.
  const { error } = await supabase.rpc("fechar_caixa_pdv_atomico", {
    p_caixa_id: p.id.trim(),
    p_valor_contado: valorFechamento,
    p_observacao: fechamentoObs,
    p_data_fechamento: p.data_fechamento,
  });

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
  if (!isUuid(p.id)) throw new Error("MOVIMENTO_ID_INVALIDO");
  if (!isUuid(p.caixa_id)) throw new Error("MOVIMENTO_CAIXA_ID_INVALIDO");
  if (typeof p.valor !== "number" || !Number.isFinite(p.valor)) {
    throw new Error("MOVIMENTO_VALOR_INVALIDO");
  }
  if (p.tipo !== "SANGRIA" && p.tipo !== "SUPRIMENTO") {
    throw new Error(`TIPO_MOVIMENTO_INVALIDO: ${p.tipo}`);
  }

  const caixaId = p.caixa_id.trim();
  const { data: caixaRow, error: caixaErr } = await supabase
    .from("caixas")
    .select("operador_id")
    .eq("id", caixaId)
    .maybeSingle();

  if (caixaErr) throw new Error(`MOVIMENTO_CAIXA_LOOKUP: ${caixaErr.message}`);
  const operadorId = caixaRow?.operador_id;
  if (!operadorId || !isUuid(String(operadorId))) {
    throw new Error("MOVIMENTO_CAIXA_OPERADOR_OBRIGATORIO");
  }

  const tipoMovimento = p.tipo === "SANGRIA" ? "sangria" : "suprimento";
  const motivo =
    typeof p.observacao === "string" && p.observacao.trim().length > 0
      ? p.observacao.trim()
      : "Movimento sincronizado (PDV local)";

  const { error } = await supabase.rpc("registrar_movimentacao", {
    p_caixa_id: caixaId,
    p_tipo: tipoMovimento,
    p_forma_pagamento: "dinheiro",
    p_valor: p.valor,
    p_motivo: motivo,
    p_motivo_codigo: "OUTRO",
    p_status: null,
    p_movimentacao_origem_id: null,
    p_idempotency_key: p.id.trim(),
    p_ip_address: null,
    p_user_agent: null,
    p_device_id: null,
    p_terminal_id: "sync-outbox",
    p_operador_id: String(operadorId).trim(),
    p_gerente_id: null,
  });

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
) {
  const parsedJson = JSON.parse(ev.payload_json);
  const payload = parseVendaPayload(parsedJson);
  const strictManagerDiscountAuth = Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH") === "true";
  const _t0 = Date.now();

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

  if (rpcVendaErr) {
    await captureEdgeException(new Error(rpcVendaErr.message), {
      trace_id: payload.venda_id,
      venda_id: payload.venda_id,
      caixa_id: payload.caixa_id ?? undefined,
      evento: "erro_rpc_venda",
      rpc: "registrar_venda_com_itens",
      event_type: "VENDA_REGISTRADA",
    });
    throw new Error(`ERRO_RPC_REGISTRAR_VENDA: ${rpcVendaErr.message}`);
  }
  const _t1 = Date.now();

  await aplicarBaixaEstoquePorItem(
    supabase,
    payload.venda_id,
    (payload.itens ?? []).map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
  );
  const _t2 = Date.now();

  await maybeEnqueueFiscalDocumentAfterSyncedVenda(supabase, payload, log);

  log({
    level: "info",
    stage: "venda_registrada",
    path: "sync_outbox",
    rpc: "registrar_venda_com_itens",
    venda_id: payload.venda_id,
    steps: {
      rpc_ms: _t1 - _t0,
      estoque_ms: _t2 - _t1,
      total_ms: Date.now() - _t0,
    },
  });
}

async function handleCatalogoSync(req: Request, supabase: SupabaseAdmin) {
  const [produtosRes, regrasRes] = await Promise.all([
    supabase
      .from("produtos")
      .select("id,nome,codigo_barras,preco_varejo,categoria_id,ativo,status_publicacao,origem,tem_nf,imagem_url")
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

  return jsonResponse(req, 200, { ok: true, produtos: produtosRes.data ?? [], regras: regrasRes.data ?? [] });
}

async function handlePdvConfigSync(req: Request, supabase: SupabaseAdmin) {
  const { data, error, status } = await supabase
    .from("pdv_config")
    .select("gerente_id, max_desconto_gerente_percentual")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (status === 404 || status === 400) return jsonResponse(req, 200, { ok: true, config: null });
    throw new Error(`ERRO_PDV_CONFIG: ${error.message}`);
  }

  const configComFlag = data ? {
    ...data,
    strict_manager_auth: Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH") === "true"
  } : null;

  return jsonResponse(req, 200, { ok: true, config: configComFlag });
}

async function handleGetByOp(
  req: Request,
  op: string | null,
  supabase: SupabaseAdmin,
): Promise<Response | null> {
  if (op === "catalogo") return await handleCatalogoSync(req, supabase);
  if (op === "pdv_config") return await handlePdvConfigSync(req, supabase);
  return null;
}

function publicBatchError(err: string, exposeInternalErrors: boolean): string {
  if (exposeInternalErrors) return err;
  return "EVENT_PROCESSING_FAILED";
}

/**
 * Prioridade causal por tipo (chave de ordenação determinística por caixa):
 * ABERTO < VENDA/MOVIMENTO < FECHADO. Garante o invariante independentemente do
 * relógio (created_at é resolução de segundos e não é monotônico confiável).
 */
function typePriority(tipo: string): number {
  switch (tipo) {
    case "CAIXA_ABERTO":
      return 0;
    case "VENDA_REGISTRADA":
    case "MOVIMENTO_CAIXA":
      return 1;
    case "CAIXA_FECHADO":
      return 2;
    default:
      return 1;
  }
}

/**
 * Chave de caixa de um evento (para ordenação/serialização causal por caixa).
 * VENDA/MOVIMENTO → payload.caixa_id; CAIXA_ABERTO/FECHADO → payload.id.
 */
function caixaKeyOf(ev: OutboxEvent): string | null {
  try {
    const p = JSON.parse(ev.payload_json);
    if (ev.tipo === "CAIXA_ABERTO" || ev.tipo === "CAIXA_FECHADO") {
      return isUuid(p?.id) ? String(p.id).trim() : null;
    }
    if (ev.tipo === "MOVIMENTO_CAIXA" || ev.tipo === "VENDA_REGISTRADA") {
      return isUuid(p?.caixa_id) ? String(p.caixa_id).trim() : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function dispatchOutboxEvent(
  supabase: SupabaseAdmin,
  ev: OutboxEvent,
): Promise<void> {
  if (ev.tipo === "VENDA_REGISTRADA") await processVenda(supabase, ev);
  else if (ev.tipo === "CAIXA_ABERTO") await processCaixaAberto(supabase, ev);
  else if (ev.tipo === "CAIXA_FECHADO") await processCaixaFechado(supabase, ev);
  else if (ev.tipo === "MOVIMENTO_CAIXA") await processMovimentoCaixa(supabase, ev);
  else throw new Error(`TIPO_DESCONHECIDO: ${ev.tipo}`);
}

async function handlePostOutboxBatch(
  supabase: SupabaseAdmin,
  rawBody: string,
  req: Request,
  requestId: string,
  reqStart: number,
  exposeInternalErrors: boolean,
): Promise<Response> {
  let body: SyncRequest;
  try {
    body = parseSyncRequest(JSON.parse(rawBody));
  } catch (e) {
    const err = e instanceof Error ? e.message : "INVALID_JSON";
    return jsonResponse(req, 400, { ok: false, error: err, request_id: requestId });
  }

  const processed: string[] = [];
  const failed: { id: string; error: string }[] = [];
  log({
    level: "info",
    stage: "sync_start",
    request_id: requestId,
    event_count: body.events.length,
  });

  // Ordenação causal DETERMINÍSTICA.
  //
  // Ordem canônica cross-batch = `event_version` ASC (sequência monotônica por
  // dispositivo, independente de relógio/rede/retry). `created_at` NÃO é
  // monotônico confiável (SQLite datetime('now') em segundos + id UUID), então
  // não participa da ordem quando há event_version. Fallback determinístico
  // (clientes pré-migração sem event_version, ou empate): prioridade de tipo —
  // ABERTO < VENDA/MOVIMENTO < FECHADO — depois created_at + id só de desempate.
  const ordered = [...body.events].sort((a, b) => {
    const va = a.event_version;
    const vb = b.event_version;
    if (va != null && vb != null && va !== vb) return va - vb;
    const pa = typePriority(a.tipo);
    const pb = typePriority(b.tipo);
    if (pa !== pb) return pa - pb;
    const ca = a.created_at || "";
    const cb = b.created_at || "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Serialização por caixa (stop-on-first-failure): se um evento de um caixa
  // falha, os posteriores DO MESMO caixa são adiados (não aplicados) para o
  // próximo batch. Garante que CAIXA_FECHADO nunca seja aplicado antes de uma
  // VENDA/MOVIMENTO anterior que ainda não sincronizou — evita fechar com
  // valor_sistema incompleto e o poison VENDA_CAIXA_FECHADO.
  const failedCaixaIds = new Set<string>();

  for (const ev of ordered) {
    const caixaKey = caixaKeyOf(ev);

    if (caixaKey && failedCaixaIds.has(caixaKey)) {
      failed.push({
        id: ev.id,
        error: publicBatchError("CAIXA_EVENTO_ANTERIOR_PENDENTE", exposeInternalErrors),
      });
      log({
        level: "warn",
        stage: "event_deferred",
        request_id: requestId,
        event_id: ev.id,
        event_type: ev.tipo,
        correlation_id: eventCorrelationId(ev),
      });
      continue;
    }

    try {
      await dispatchOutboxEvent(supabase, ev);
      processed.push(ev.id);
      log({
        level: "info",
        stage: "event_processed",
        request_id: requestId,
        event_id: ev.id,
        event_type: ev.tipo,
        correlation_id: eventCorrelationId(ev),
      });
    } catch (e) {
      if (caixaKey) failedCaixaIds.add(caixaKey);
      const rawErr = e instanceof Error ? e.message : String(e);
      failed.push({ id: ev.id, error: publicBatchError(rawErr, exposeInternalErrors) });
      log({
        level: "warn",
        stage: "event_failed",
        request_id: requestId,
        event_id: ev.id,
        event_type: ev.tipo,
        correlation_id: eventCorrelationId(ev),
        error: rawErr,
      });
      await captureEdgeException(e, {
        trace_id: eventCorrelationId(ev),
        evento: "erro_sync_outbox",
        event_type: ev.tipo,
        request_id: requestId,
      });
    }
  }

  log({
    level: "info",
    stage: "sync_end",
    request_id: requestId,
    processed_count: processed.length,
    failed_count: failed.length,
    duration_ms: Date.now() - reqStart,
  });
  return jsonResponse(req, 200, { ok: true, processed, failed, request_id: requestId });
}

Deno.serve(async (req) => {
  const requestId = newRequestId();
  const reqStart = Date.now();
  const exposeInternalErrors = shouldExposeInternalErrors();
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const syncKey = Deno.env.get("SYNC_KEY")?.trim() ?? "";
  const hasDeviceKeys = parseDeviceKeyMap(Deno.env.get("SYNC_DEVICE_KEYS")).size > 0;
  if (!supabaseUrl || !serviceRole || (!syncKey && !hasDeviceKeys)) {
    log({ level: "error", stage: "env", request_id: requestId, error: "MISSING_SUPABASE_ENV" });
    return jsonResponse(req, 500, { ok: false, error: "MISSING_SUPABASE_ENV", request_id: requestId });
  }

  const url = new URL(req.url);
  const op = url.searchParams.get("op");
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const rawBody = req.method === "POST" ? await req.text() : "";
  const auth = await authorizeSync(req, syncKey, supabase, rawBody);
  if (!auth.ok) {
    log({
      level: "warn",
      stage: "auth",
      request_id: requestId,
      error: auth.error,
    });
    const authError = authErrorForClientResponse(
      auth.error ?? "UNAUTHORIZED",
      exposeInternalErrors,
    );
    return jsonResponse(req, 401, { ok: false, error: authError, request_id: requestId });
  }

  try {
    if (req.method === "GET") {
      const getRes = await handleGetByOp(req, op, supabase);
      if (getRes) return getRes;
      return jsonResponse(req, 400, { ok: false, error: "INVALID_OPERATION", request_id: requestId });
    }

    if (req.method === "POST") {
      if (op === "validar_gerente") {
        return await handleValidarGerentePdvSync(
          supabase,
          rawBody,
          req,
        );
      }
      return await handlePostOutboxBatch(
        supabase,
        rawBody,
        req,
        requestId,
        reqStart,
        exposeInternalErrors,
      );
    }

    return jsonResponse(req, 400, { ok: false, error: "INVALID_OPERATION", request_id: requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log({
      level: "error",
      stage: "sync_fatal",
      request_id: requestId,
      error: msg,
      duration_ms: Date.now() - reqStart,
    });
    return jsonResponse(req, 500, {
      ok: false,
      error: "ERRO_INTERNO",
      request_id: requestId,
    });
  }
});

/** Limpeza oportunista (~3% das requisições autenticadas) para manter a tabela pequena sem job dedicado. */
async function maybePruneExpiredSyncNonces(supabase: SupabaseAdmin): Promise<void> {
  if (secureUnitRandom() >= 0.03) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("sync_request_nonces").delete().lt("expires_at", nowIso);
  if (error) {
    log({ level: "warn", stage: "nonce_prune", error: error.message });
  }
}

async function authorizeSync(req: Request, syncKey: string, supabase: SupabaseAdmin, rawBody: string) {
  const gotKey = req.headers.get("X-SYNC-KEY")?.trim();
  const ts = req.headers.get("X-SYNC-TS");
  const nonce = req.headers.get("X-SYNC-NONCE");
  const signature = req.headers.get("X-SYNC-SIGNATURE");
  const device = (req.headers.get("x-device-fingerprint") ?? "").trim().toLowerCase();
  const enforceAllowlist = (Deno.env.get("SYNC_ENFORCE_DEVICE_ALLOWLIST") ?? "auto").trim().toLowerCase();
  const allowedDevices = parseCsvLowerSet(Deno.env.get("SYNC_ALLOWED_DEVICE_FINGERPRINTS"));
  const deviceKeyMap = parseDeviceKeyMap(Deno.env.get("SYNC_DEVICE_KEYS"));
  const shouldEnforceAllowlist =
    enforceAllowlist === "true" ||
    enforceAllowlist === "1" ||
    enforceAllowlist === "yes" ||
    ((enforceAllowlist === "auto" || enforceAllowlist === "") && allowedDevices.size > 0);

  if (!ts || !nonce || !signature) return { ok: false, error: "MISSING_HEADERS" };
  if (!device) return { ok: false, error: "MISSING_DEVICE_FINGERPRINT" };
  if (shouldEnforceAllowlist && !allowedDevices.has(device)) {
    return { ok: false, error: "DEVICE_NOT_ALLOWED" };
  }
  const expectedKey = deviceKeyMap.size > 0 ? deviceKeyMap.get(device) : syncKey;
  if (!expectedKey) return { ok: false, error: "DEVICE_NOT_ALLOWED" };
  if (!gotKey || !(await timingSafeEqualSecret(gotKey, expectedKey))) {
    return { ok: false, error: "UNAUTHORIZED" };
  }
  const nonceTrim = nonce.trim();
  if (!isUuid(nonceTrim)) return { ok: false, error: "INVALID_NONCE" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, error: "INVALID_TS" };
  if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, error: "TS_OUT_OF_WINDOW" };

  const payload = buildSignaturePayload(ts, nonceTrim, device, rawBody);
  const expectedSig = await hmacSha256Hex(expectedKey, payload);
  if (!timingSafeEqualStr(signature.toLowerCase(), expectedSig.toLowerCase())) return { ok: false, error: "INVALID_SIG" };

  const expiresAt = new Date((tsNum + NONCE_TTL_SECONDS) * 1000).toISOString();
  const { error } = await supabase.from("sync_request_nonces").insert({
    nonce: nonceTrim,
    device_fingerprint: device,
    request_ts: tsNum,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: "REPLAY_OR_DB_ERROR" };

  try {
    await maybePruneExpiredSyncNonces(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log({ level: "warn", stage: "nonce_prune_fatal", error: msg });
  }

  return { ok: true };
}
