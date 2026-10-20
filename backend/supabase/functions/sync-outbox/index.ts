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
// | GET    | catalogo       | handleCatalogoSync         | Catálogo: produtos + regras_preco + precos_atacado (Aut#1 / PRICE_RESOLUTION_CHAIN) |
// | GET    | pdv_config     | handlePdvConfigSync        | gerente_id, max_desconto…; strict_manager_auth (sem hash de senha) |
// | GET    | outro/ausente  | —                          | 400 INVALID_OPERATION |
// | POST   | validar_gerente| handleValidarGerentePdvSync| token gerente + expiração (se ok) — token sensível; erros genéricos |
// | POST   | (omitido)      | handlePostOutboxBatch      | processed[], failed[{id,error}], request_id — IDs + mensagens de erro internas |
// |        |                | dispatchOutboxEvent tipos  | Corpo só no POST: VENDA_REGISTRADA (venda+itens), CAIXA_*, MOVIMENTO_CAIXA — persiste no DB; resposta agregada no batch |
// |        |                | pós-venda fiscal (opcional) | Se `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE=true`, chama RPC `fiscal_enfileirar_documento_venda`. Falha intermediária rejeita o evento para retry idempotente (venda já registrada retorna; baixa `BAIXA_JA_EXISTE`; fiscal faz upsert). |
// ---

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { timingSafeEqualSecret, timingSafeEqualStr } from "../_shared/crypto.ts";
import { validateGerenteAndIssueToken } from "../_shared/gerente-auth.ts";
import { logJson } from "../_shared/logger.ts";
import { assertMesmaLoja, caixaInsertForLoja, requireExplicitLojaId } from "./caixaLoja.ts";
import { maybeEnqueueFiscalDocumentAfterSyncedVenda } from "./fiscal_enqueue_after_venda_sync.ts";
import { captureEdgeException } from "../_shared/sentryEdge.ts";
import { avaliarEventoNoPlano } from "./planGate.ts";
import {
  assertEventoNoEscopo,
  type DispositivoPdv,
  legacyKeysEnabled,
  normalizarCodigoAtivacao,
  resolveAuthContext,
  type ScopeLookups,
  type SyncContext,
} from "./tenantScope.ts";

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

const MAX_EVENTS_PER_REQUEST = 200;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const NONCE_TTL_SECONDS = 10 * 60;
const CORS_ALLOW_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOW_HEADERS =
  "content-type, x-sync-key, x-sync-ts, x-sync-nonce, x-sync-signature, x-device-fingerprint, x-loja-id";

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

type VendaPagamentoPayload = { forma_pagamento: string; valor: number };

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
  loja_id: string;
  /**
   * Sprint C2.10 (P0-5) — split de pagamento opcional. `pdv-local`
   * (cliente desktop Tauri) não captura pagamento misto hoje — sua tabela
   * local `vendas` só tem `forma_pagamento TEXT` escalar
   * (`pdv-local/src-tauri/src/db.rs`) — então este campo fica ausente em
   * todo tráfego real atual, e `registrar_venda_com_itens` cai no
   * comportamento escalar de sempre (1 pagamento = forma_pagamento/
   * total_liquido). Quando o cliente desktop capturar split no futuro
   * (fora desta sprint), basta enviar este campo — nenhuma outra mudança
   * de backend é necessária.
   */
  pagamentos?: VendaPagamentoPayload[] | null;
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

/** Sprint C2.10 (P0-5) — parse opcional e estrito: se `pagamentos` vier no
 * payload, cada entrada precisa ter forma_pagamento+valor válidos (mesma
 * validação de forma no RPC); malformado = rejeita a venda inteira, nunca
 * ignora silenciosamente uma entrada. Ausente = comportamento escalar. */
function setPagamentosFromPayload(raw: Record<string, unknown>, payload: VendaPayload): void {
  if (!("pagamentos" in raw) || raw.pagamentos == null) return;
  const arr = raw.pagamentos;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("PAYLOAD_PAGAMENTOS_INVALIDO");
  }
  const pagamentos: VendaPagamentoPayload[] = arr.map((p) => {
    if (!isRecord(p)) throw new Error("PAYLOAD_PAGAMENTOS_INVALIDO");
    const forma = p.forma_pagamento;
    const valor = p.valor;
    if (typeof forma !== "string" || !forma.trim()) throw new Error("PAYLOAD_PAGAMENTOS_INVALIDO");
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) throw new Error("PAYLOAD_PAGAMENTOS_INVALIDO");
    return { forma_pagamento: forma.trim(), valor };
  });
  payload.pagamentos = pagamentos;
}

function applyVendaOptionalFields(raw: Record<string, unknown>, payload: VendaPayload): void {
  setCaixaIdFromPayload(raw, payload);
  setOperadorIdFromPayload(raw, payload);
  setTrocoInicialFromPayload(raw, payload);
  setDescontoGerenteFromPayload(raw, payload);
  setGerenteIdFromPayload(raw, payload);
  setDescontoTokenFromPayload(raw, payload);
  setPagamentosFromPayload(raw, payload);
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
    loja_id: requireExplicitLojaId(raw.loja_id),
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
  ctx?: SyncContext,
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
    // Dispositivo ativado: senha de gerente e token presos à loja/empresa do dispositivo (não à Empresa 1).
    lojaId: ctx?.mode === "dispositivo" ? ctx.lojaId : null,
    empresaId: ctx?.mode === "dispositivo" ? ctx.empresaId ?? null : null,
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
    // Emissor legado (PDV desktop): nunca emite token tipado. Sangria e
    // pagamento AP passam pelo `validar-gerente`, que exige solicitante
    // autenticado para amarrar solicitante/aprovador/loja.
    finalidade: null,
    alvoId: null,
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
  lojaId: unknown,
) {
  if (!isUuid(caixaId)) return;

  const valorInicial =
    trocoInicial != null && Number.isFinite(trocoInicial) ? trocoInicial : 0;
  const op = isUuid(operadorId) ? operadorId.trim() : null;
  const id = caixaId.trim();
  const rowInsert = caixaInsertForLoja({
    id,
    operadorId: op,
    valorInicial,
    lojaId,
  });

  const { data: row, error: selErr } = await supabase
    .from("caixas")
    .select("id,loja_id")
    .eq("id", id)
    .maybeSingle();

  if (selErr) throw new Error(`ERRO_CAIXA_LOOKUP: ${selErr.message}`);
  if (row) {
    assertMesmaLoja(row.loja_id == null ? null : String(row.loja_id), rowInsert.loja_id);
    return;
  }

  const { error: insErr } = await supabase.from("caixas").insert(rowInsert);

  if (insErr && !String(insErr.message).includes("duplicate key")) {
    throw new Error(`ERRO_CAIXA_INSERT: ${insErr.message}`);
  }
}

async function processCaixaAberto(supabase: SupabaseAdmin, ev: OutboxEvent) {
  const p = JSON.parse(ev.payload_json) as {
    id: string;
    operador_id?: string | null;
    valor_inicial?: number;
    loja_id?: unknown;
  };
  const inicial = p.valor_inicial != null && Number.isFinite(p.valor_inicial)
    ? p.valor_inicial
    : 0;
  await ensureCaixaPdv(supabase, p.id, p.operador_id ?? null, inicial, p.loja_id);
}

async function processCaixaFechado(supabase: SupabaseAdmin, ev: OutboxEvent) {
  // BA-010: SSoT de fechamento PDV Local = RPC fechar_caixa_pdv_atomico (migração 227).
  // Não recalcular valor_sistema nem UPDATE direto — evita divergência com o fechamento atômico.
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

  const caixaId = p.id.trim();
  const { error } = await supabase.rpc("fechar_caixa_pdv_atomico", {
    p_caixa_id: caixaId,
    p_valor_contado: valorFechamento,
    p_observacao: fechamentoObs,
    p_data_fechamento: p.data_fechamento,
  });

  if (!error) return;

  const msg = error.message ?? "";
  // Replay idempotente: outbox reenvia CAIXA_FECHADO após sucesso (comportamento do UPDATE antigo 0 rows).
  if (msg.includes("FECHAR_CAIXA_PDV_NAO_ENCONTRADO")) {
    const { data: row, error: readErr } = await supabase
      .from("caixas")
      .select("status")
      .eq("id", caixaId)
      .maybeSingle();
    if (readErr) throw new Error(`ERRO_CAIXA_FECHADO: ${readErr.message}`);
    if (row && (row as { status?: string }).status === "FECHADO") return;
  }

  throw new Error(`ERRO_CAIXA_FECHADO: ${msg}`);
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
  ctx?: SyncContext,
) {
  const parsedJson = JSON.parse(ev.payload_json);
  const payload = parseVendaPayload(parsedJson);
  await liberarVendaOfflineSeSuspensa(supabase, ev, payload.venda_id, ctx);
  const strictManagerDiscountAuth = Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH") === "true";
  const _t0 = Date.now();

  await ensureCaixaPdv(
    supabase,
    payload.caixa_id,
    payload.operador_id,
    payload.troco_inicial_caixa ?? null,
    payload.loja_id,
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
    // Sprint C2.10 (P0-5): null em todo tráfego real hoje (pdv-local não
    // envia) -> RPC cai no comportamento escalar de sempre, sem mudança.
    p_pagamentos: payload.pagamentos ?? null,
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

  const { error: ledgerErr } = await supabase.rpc("ensure_venda_evento_registrado", {
    p_sale_id: payload.venda_id,
    p_source: "sync_outbox",
  });
  if (ledgerErr) {
    throw new Error(`ERRO_RPC_REGISTRAR_VENDA_EVENTO: ${ledgerErr.message}`);
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

function parseLojaIdHeader(req: Request): string | null {
  const raw = (req.headers.get("x-loja-id") ?? "").trim();
  if (!raw) {
    const fromEnv = (Deno.env.get("DEFAULT_PDV_LOJA_ID") ?? "").trim();
    return fromEnv.length > 0 ? fromEnv : null;
  }
  return raw;
}

async function handleCatalogoSync(req: Request, supabase: SupabaseAdmin, ctx: SyncContext) {
  // Aut#1: precos_atacado como array canônico (não projetar em regras_preco).
  // Multiempresa: dispositivo ativado ⇒ catálogo SÓ da loja do dispositivo (loja vinda do servidor).
  const lojaId = ctx.mode === "dispositivo" ? ctx.lojaId : parseLojaIdHeader(req);
  let produtosQuery = supabase
    .from("produtos")
    .select(
      "id,nome,codigo_barras,preco_varejo,preco_atacado,categoria_id,ativo,status_publicacao,origem,tem_nf,imagem_url",
    );
  if (ctx.mode === "dispositivo") produtosQuery = produtosQuery.eq("loja_id", ctx.lojaId);
  const REGRAS_COLS =
    "id,tipo_regra,produto_id,categoria_id,quantidade_minima,quantidade_maxima,tipo_desconto,valor_desconto,data_validade,ativo";
  const regrasDaEmpresa = async () => {
    // Fase 2+: regras_preco tem empresa_id ⇒ dispositivo recebe só as da própria empresa (inclui regras gerais).
    if (ctx.mode !== "dispositivo" || !ctx.empresaId) {
      return await supabase.from("regras_preco").select(REGRAS_COLS).eq("ativo", true).limit(100000);
    }
    const r = await supabase.from("regras_preco").select(`${REGRAS_COLS},empresa_id`).eq("ativo", true)
      .eq("empresa_id", ctx.empresaId).limit(100000);
    if (r.error && /empresa_id/.test(r.error.message)) {
      return await supabase.from("regras_preco").select(REGRAS_COLS).eq("ativo", true).limit(100000);
    }
    return r;
  };
  const [produtosRes, regrasRes, atacadoRes] = await Promise.all([
    produtosQuery
      .order("nome", { ascending: true })
      .limit(100000),
    regrasDaEmpresa(),
    supabase
      .from("precos_atacado")
      .select("id,produto_id,loja_id,quantidade_minima,preco_unitario,ativo")
      .eq("ativo", true)
      .limit(100000),
  ]);

  if (produtosRes.error) throw new Error(`ERRO_CATALOGO_PRODUTOS: ${produtosRes.error.message}`);
  if (regrasRes.error) throw new Error(`ERRO_CATALOGO_REGRAS: ${regrasRes.error.message}`);
  if (atacadoRes.error) throw new Error(`ERRO_CATALOGO_PRECOS_ATACADO: ${atacadoRes.error.message}`);

  const precosAtacado = ((atacadoRes.data ?? []) as Array<{
    id: string;
    produto_id: string;
    loja_id: string | null;
    quantidade_minima: number;
    preco_unitario: number;
    ativo: boolean;
  }>).filter((row) => {
    const lid = row.loja_id;
    return lid == null || (lojaId != null && lid === lojaId);
  });

  const produtos = (produtosRes.data ?? []) as Array<{ id: string; categoria_id?: string | null }>;
  let regras = (regrasRes.data ?? []) as Array<{ produto_id?: string | null; categoria_id?: string | null }>;
  let atacadoFiltrado = precosAtacado;
  if (ctx.mode === "dispositivo") {
    // regras_preco/precos_atacado ainda não têm empresa_id (D12, etapa 6): restringe pelos produtos/categorias
    // da loja. Regra sem produto e sem categoria (global) não é enviada a dispositivos de tenant.
    const prodIds = new Set(produtos.map((p) => p.id));
    const catIds = new Set(produtos.map((p) => p.categoria_id).filter((c): c is string => !!c));
    const porEmpresa = regras.length > 0 && regras.every((r) => "empresa_id" in r);
    regras = regras.filter((r) =>
      (r.produto_id != null && prodIds.has(r.produto_id)) ||
      (r.produto_id == null && r.categoria_id != null && catIds.has(r.categoria_id)) ||
      // regra geral (sem produto/categoria) só quando já veio filtrada pela empresa do dispositivo
      (porEmpresa && r.produto_id == null && r.categoria_id == null)
    ).map((r) => {
      const { empresa_id: _e, ...resto } = r as Record<string, unknown>;
      return resto as typeof r;
    });
    atacadoFiltrado = precosAtacado.filter((r) => prodIds.has(r.produto_id));
  }

  return jsonResponse(req, 200, {
    ok: true,
    produtos,
    regras,
    precos_atacado: atacadoFiltrado,
    loja_id: lojaId,
  });
}

async function handlePdvConfigSync(req: Request, supabase: SupabaseAdmin, ctx: SyncContext) {
  const lojaId = ctx.mode === "dispositivo" ? ctx.lojaId : parseLojaIdHeader(req);
  const base = supabase
    .from("pdv_config")
    .select("gerente_id, max_desconto_gerente_percentual, quantidade_minima_atacado_padrao");
  // legado: linha id=1 (cliente 1, inalterado). Dispositivo: config da própria loja.
  let { data, error, status } = await (ctx.mode === "dispositivo"
    ? base.eq("loja_id", ctx.lojaId)
    : base.eq("id", 1)).maybeSingle();
  // Dispositivo sem linha própria da loja ⇒ linha padrão da EMPRESA do dispositivo (fase 3), nunca a de outra.
  if (!error && !data && ctx.mode === "dispositivo" && ctx.empresaId) {
    const padrao = await supabase
      .from("pdv_config")
      .select("gerente_id, max_desconto_gerente_percentual, quantidade_minima_atacado_padrao")
      .is("loja_id", null)
      .eq("empresa_id", ctx.empresaId)
      .maybeSingle();
    if (!padrao.error) data = padrao.data;
  }

  if (error) {
    if (status === 404 || status === 400) return jsonResponse(req, 200, { ok: true, config: null });
    throw new Error(`ERRO_PDV_CONFIG: ${error.message}`);
  }

  const configComFlag = data
    ? {
      ...data,
      loja_id: lojaId,
      strict_manager_auth: Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH") === "true",
    }
    : null;

  return jsonResponse(req, 200, { ok: true, config: configComFlag });
}

async function handleGetByOp(
  req: Request,
  op: string | null,
  supabase: SupabaseAdmin,
  ctx: SyncContext,
): Promise<Response | null> {
  if (op === "catalogo") return await handleCatalogoSync(req, supabase, ctx);
  if (op === "pdv_config") return await handlePdvConfigSync(req, supabase, ctx);
  return null;
}

function publicBatchError(err: string, exposeInternalErrors: boolean): string {
  if (exposeInternalErrors) return err;
  return "EVENT_PROCESSING_FAILED";
}

function scopeLookups(supabase: SupabaseAdmin): ScopeLookups {
  return {
    caixaLoja: async (caixaId: string) => {
      const { data, error } = await supabase.from("caixas").select("loja_id").eq("id", caixaId).maybeSingle();
      if (error) throw new Error(`ESCOPO_CAIXA_LOOKUP: ${error.message}`);
      return data?.loja_id == null ? null : String(data.loja_id);
    },
    produtosForaDaLoja: async (ids: string[], lojaId: string) => {
      const { data, error } = await supabase.from("produtos").select("id,loja_id").in("id", ids);
      if (error) throw new Error(`ESCOPO_PRODUTOS_LOOKUP: ${error.message}`);
      const daLoja = new Set(((data ?? []) as Array<{ id: string; loja_id: string }>)
        .filter((r) => String(r.loja_id) === lojaId).map((r) => String(r.id)));
      return ids.filter((id) => !daLoja.has(id)).length;
    },
    operadorPodeLoja: async (operadorId: string, lojaId: string) => {
      const { data, error } = await supabase.rpc("fp_usuario_pode_loja", { p_usuario: operadorId, p_loja: lojaId });
      if (error) throw new Error(`ESCOPO_OPERADOR_LOOKUP: ${error.message}`);
      return data === true;
    },
  };
}

/**
 * Cobrança: venda feita offline ANTES da suspensão por cobrança é liberada (política no banco,
 * `cobranca_liberar_venda_offline`); fora da política o gatilho de vendas recusa como sempre.
 * Sem efeito fora do modo dispositivo, sem suspensão de cobrança ou sem a migration.
 */
async function liberarVendaOfflineSeSuspensa(
  supabase: SupabaseAdmin,
  ev: OutboxEvent,
  vendaId: string,
  ctx?: SyncContext,
): Promise<void> {
  if (ctx?.mode !== "dispositivo" || !ctx.dispositivoId) return;
  const vendaEm = ev.created_at && !Number.isNaN(Date.parse(ev.created_at)) ? ev.created_at : null;
  const { data, error } = await supabase.rpc("cobranca_liberar_venda_offline", {
    p_dispositivo: ctx.dispositivoId,
    p_venda_id: vendaId,
    p_venda_em: vendaEm,
  });
  if (error) {
    log({ level: "warn", stage: "venda_offline_liberacao", venda_id: vendaId, error: error.message });
    return;
  }
  const r = data as { liberada?: boolean; motivo?: string } | null;
  if (r && r.liberada === false && r.motivo !== "SEM_SUSPENSAO_COBRANCA") {
    log({ level: "info", stage: "venda_offline_nao_liberada", venda_id: vendaId, motivo: r.motivo });
  }
}

async function dispatchOutboxEvent(
  supabase: SupabaseAdmin,
  ev: OutboxEvent,
  ctx: SyncContext,
): Promise<void> {
  await assertEventoNoEscopo(ev, ctx, scopeLookups(supabase));
  if (ctx.mode === "dispositivo" && ctx.empresaId) {
    const { data: recursos, error: recErr } = await supabase.rpc("fp_recursos_empresa", { p_empresa: ctx.empresaId });
    // função ausente (migration de cobrança não aplicada) ⇒ comportamento antigo
    if (!recErr) {
      const gate = avaliarEventoNoPlano(ev.tipo, (recursos ?? null) as string[] | null);
      if (!gate.ok) throw new Error(gate.error);
    }
  }
  if (ev.tipo === "VENDA_REGISTRADA") await processVenda(supabase, ev, ctx);
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
  ctx: SyncContext,
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

  for (const ev of body.events) {
    try {
      await dispatchOutboxEvent(supabase, ev, ctx);
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
  if (!supabaseUrl || !serviceRole) {
    log({ level: "error", stage: "env", request_id: requestId, error: "MISSING_SUPABASE_ENV" });
    return jsonResponse(req, 500, { ok: false, error: "MISSING_SUPABASE_ENV", request_id: requestId });
  }

  const url = new URL(req.url);
  const op = url.searchParams.get("op");
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const rawBody = req.method === "POST" ? await req.text() : "";

  // Ativação por código (antes do HMAC: o PDV ainda não tem segredo). Código de uso único, 24h, hash no banco.
  if (req.method === "POST" && op === "ativar") {
    return await handleAtivarDispositivo(req, supabase, rawBody, requestId);
  }

  const auth = await authorizeSync(req, syncKey, supabase, rawBody);
  if (!auth.ok || !auth.ctx) {
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
      const getRes = await handleGetByOp(req, op, supabase, auth.ctx);
      if (getRes) return getRes;
      return jsonResponse(req, 400, { ok: false, error: "INVALID_OPERATION", request_id: requestId });
    }

    if (req.method === "POST") {
      if (op === "validar_gerente") {
        return await handleValidarGerentePdvSync(
          supabase,
          rawBody,
          req,
          auth.ctx,
        );
      }
      return await handlePostOutboxBatch(
        supabase,
        rawBody,
        req,
        requestId,
        reqStart,
        exposeInternalErrors,
        auth.ctx,
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

const ATIVACAO_ERROS_PUBLICOS = new Set([
  "ATIVACAO_PDV_CODIGO_INVALIDO",
  "ATIVACAO_PDV_FINGERPRINT_INVALIDO",
  "EMPRESA_NAO_OPERACIONAL",
  "ATIVACAO_PDV_BLOQUEADA",
]);

function ipDaRequisicao(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || req.headers.get("x-real-ip")?.trim() || null)?.slice(0, 64) ?? null;
}

async function handleAtivarDispositivo(
  req: Request,
  supabase: SupabaseAdmin,
  rawBody: string,
  requestId: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(req, 400, { ok: false, error: "INVALID_JSON", request_id: requestId });
  }
  if (!isRecord(body)) return jsonResponse(req, 400, { ok: false, error: "INVALID_BODY", request_id: requestId });
  const codigo = normalizarCodigoAtivacao(body.codigo);
  const fp = typeof body.device_fingerprint === "string" ? body.device_fingerprint.trim().toLowerCase() : "";
  if (!codigo) return jsonResponse(req, 400, { ok: false, error: "ATIVACAO_PDV_CODIGO_INVALIDO", request_id: requestId });
  if (fp.length < 3 || fp.length > 200) {
    return jsonResponse(req, 400, { ok: false, error: "ATIVACAO_PDV_FINGERPRINT_INVALIDO", request_id: requestId });
  }
  const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 80) : null;
  // v2: registra a tentativa e bloqueia após 10 falhas/15 min por computador ou IP (anti força-bruta).
  const { data, error } = await supabase.rpc("ativar_dispositivo_pdv_v2", {
    p_codigo: codigo,
    p_device_fingerprint: fp,
    p_nome: nome,
    p_ip: ipDaRequisicao(req),
  });
  if (!error && data && data.ok === false) {
    const code = ATIVACAO_ERROS_PUBLICOS.has(String(data.error)) ? String(data.error) : "ATIVACAO_PDV_CODIGO_INVALIDO";
    log({ level: "warn", stage: "ativar_pdv", request_id: requestId, error: code });
    return jsonResponse(req, code === "ATIVACAO_PDV_BLOQUEADA" ? 429 : 400, { ok: false, error: code, request_id: requestId });
  }
  if (error) {
    const code = [...ATIVACAO_ERROS_PUBLICOS].find((c) => String(error.message).includes(c)) ?? "ATIVACAO_PDV_FALHOU";
    log({ level: "warn", stage: "ativar_pdv", request_id: requestId, error: code });
    return jsonResponse(req, code === "ATIVACAO_PDV_FALHOU" ? 500 : 400, { ok: false, error: code, request_id: requestId });
  }
  log({ level: "info", stage: "ativar_pdv", request_id: requestId, dispositivo_id: data?.dispositivo_id, loja_id: data?.loja_id });
  return jsonResponse(req, 200, { ok: true, ...data, request_id: requestId });
}

async function lookupDispositivo(supabase: SupabaseAdmin, device: string): Promise<DispositivoPdv | null> {
  const { data, error } = await supabase
    .from("pdv_dispositivos")
    .select("id,loja_id,empresa_id,sync_secret")
    .eq("device_fingerprint", device)
    .eq("ativo", true)
    .maybeSingle();
  // Tabela ausente (migration ainda não aplicada) ⇒ cai no modo legado, sem quebrar o cliente 1.
  if (error) {
    log({ level: "warn", stage: "dispositivo_lookup", error: error.message });
    return null;
  }
  return data ? (data as DispositivoPdv) : null;
}

async function authorizeSync(
  req: Request,
  syncKey: string,
  supabase: SupabaseAdmin,
  rawBody: string,
): Promise<{ ok: boolean; error?: string; ctx?: SyncContext }> {
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
  const dispositivo = await lookupDispositivo(supabase, device);
  // dispositivo ativado por código dispensa a allowlist do ambiente (ele já é a allowlist, no banco).
  if (shouldEnforceAllowlist && !dispositivo && !allowedDevices.has(device)) {
    return { ok: false, error: "DEVICE_NOT_ALLOWED" };
  }
  const legacyKey = deviceKeyMap.size > 0 ? deviceKeyMap.get(device) ?? null : (syncKey || null);
  const resolved = resolveAuthContext({
    dispositivo,
    headerLojaId: (req.headers.get("x-loja-id") ?? "").trim() || null,
    legacyEnabled: legacyKeysEnabled(Deno.env.get("SYNC_LEGACY_KEYS_ENABLED")),
    legacyKey,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const expectedKey = resolved.expectedKey;
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

  if (resolved.ctx.mode === "dispositivo") {
    const { error: touchErr } = await supabase
      .from("pdv_dispositivos")
      .update({ ultimo_sync_em: new Date().toISOString() })
      .eq("id", resolved.ctx.dispositivoId);
    if (touchErr) log({ level: "warn", stage: "dispositivo_touch", error: touchErr.message });
  }

  return { ok: true, ctx: resolved.ctx };
}
