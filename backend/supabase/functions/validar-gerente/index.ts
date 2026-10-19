// Edge Function: validar-gerente
// Valida senha do gerente contra hash armazenado no banco (tabela pdv_config)
// Retorna token temporário de desconto se válido, ou erro se inválido
//
// Contrato:
// POST /functions/v1/validar-gerente
// Header: Authorization: Bearer <jwt> (usuário autenticado)
// Body: { senha: string, loja_id?: string, finalidade?: "SANGRIA"|"PAGAMENTO_AP", alvo_id?: string }
// Response: { ok: true, token: string, expira_em: string } | { ok: false, error: string }
//
// CORS:
// - VALIDAR_GERENTE_ALLOWED_ORIGINS: lista separada por vírgula, ex.:
//   https://seu-app.vercel.app,https://www.sualoja.com.br,http://localhost:3000
// - VALIDAR_GERENTE_CORS_STRICT=true (produção): com lista preenchida, só essas origens no ACAO;
//   se lista ausente ou só lixo, bloqueia qualquer requisição com header Origin. Sem Origin (curl etc.)
//   não é bloqueado por esta camada.
// - Sem STRICT e sem lista: legado Access-Control-Allow-Origin: * (só dev/homolog consciente).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isTokenFinalidade, validateGerenteAndIssueToken } from "../_shared/gerente-auth.ts";
import { resolverEscopoGerente } from "../_shared/escopoGerente.ts";
import { logJson } from "../../../../shared/logger.ts";

const USER_LIMIT = 5;
const IP_LIMIT = 20;
const DEVICE_LIMIT = 10;
const GLOBAL_LIMIT = 60;

const CORS_ALLOW_HEADERS =
  "authorization, content-type, x-device-fingerprint";
const CORS_ALLOW_METHODS = "POST, OPTIONS";

/** Log estruturado */
const log = (payload: Record<string, unknown>) => logJson("validar-gerente", payload);

function normalizeOriginUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function isCorsStrict(): boolean {
  const raw = Deno.env.get("VALIDAR_GERENTE_CORS_STRICT");
  const v = (raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

type CorsMode =
  | { kind: "wildcard" }
  | { kind: "allowlist"; origins: Set<string> };

function resolveCorsMode(): CorsMode {
  const strict = isCorsStrict();
  const raw = Deno.env.get("VALIDAR_GERENTE_ALLOWED_ORIGINS")?.trim() ?? "";

  if (!raw) {
    if (strict) return { kind: "allowlist", origins: new Set() };
    return { kind: "wildcard" };
  }

  const set = new Set<string>();
  for (const part of raw.split(",")) {
    const n = normalizeOriginUrl(part);
    if (n) set.add(n.toLowerCase());
  }

  if (set.size === 0) {
    if (strict) return { kind: "allowlist", origins: new Set() };
    return { kind: "wildcard" };
  }
  return { kind: "allowlist", origins: set };
}

/** true se o browser enviou Origin e não pode usar esta API em modo allowlist. */
function corsOriginForbidden(req: Request, mode: CorsMode): boolean {
  if (mode.kind === "wildcard") return false;
  const origin = req.headers.get("Origin") ?? req.headers.get("origin");
  if (!origin?.trim()) return false;
  return !mode.origins.has(normalizeOriginUrl(origin).toLowerCase());
}

function corsHeaders(req: Request, mode: CorsMode): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    "Access-Control-Max-Age": "86400",
  };
  if (mode.kind === "wildcard") {
    base["Access-Control-Allow-Origin"] = "*";
    return base;
  }
  const origin = req.headers.get("Origin") ?? req.headers.get("origin");
  if (origin?.trim() && mode.origins.has(normalizeOriginUrl(origin).toLowerCase())) {
    base["Access-Control-Allow-Origin"] = origin.trim();
    base["Vary"] = "Origin";
  }
  return base;
}

function jsonResponse(status: number, body: unknown, req: Request, mode: CorsMode) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(req, mode),
    },
  });
}

/** IP para auditoria de CORS (Edge / proxy). */
function clientIpForCorsLog(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for")?.trim();
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}

function logCorsBlocked(req: Request): void {
  const origin =
    req.headers.get("Origin") ?? req.headers.get("origin") ?? "";
  const ip = clientIpForCorsLog(req);
  const ts = new Date().toISOString();
  const originLabel = origin || "(none)";
  log({
    level: "warn",
    stage: "cors",
    error: "ORIGIN_NOT_ALLOWED",
    origin: origin || null,
    ip,
    ts,
  });
}

Deno.serve(async (req) => {
  const corsMode = resolveCorsMode();

  if (req.method === "OPTIONS") {
    if (corsOriginForbidden(req, corsMode)) {
      logCorsBlocked(req);
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req, corsMode),
    });
  }

  if (corsOriginForbidden(req, corsMode)) {
    logCorsBlocked(req);
    return new Response(JSON.stringify({ ok: false, error: "ORIGIN_NOT_ALLOWED" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    log({ level: "warn", stage: "http", error: "METHOD_NOT_ALLOWED" });
    return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, req, corsMode);
  }

  // Parse do body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    log({ level: "warn", stage: "http", error: "INVALID_JSON" });
    return jsonResponse(400, { ok: false, error: "INVALID_JSON" }, req, corsMode);
  }

  // Validação do payload
  if (typeof body !== "object" || body === null) {
    return jsonResponse(400, { ok: false, error: "INVALID_BODY" }, req, corsMode);
  }

  const { senha, loja_id, finalidade, alvo_id } = body as {
    senha?: unknown;
    loja_id?: unknown;
    finalidade?: unknown;
    alvo_id?: unknown;
  };

  // Finalidade tipada é opcional (ausente = token legado), mas se vier tem de
  // ser uma das conhecidas e acompanhada do alvo. Valor desconhecido = recusa.
  if (finalidade !== undefined && finalidade !== null && !isTokenFinalidade(finalidade)) {
    return jsonResponse(400, { ok: false, error: "FINALIDADE_DESCONHECIDA" }, req, corsMode);
  }
  const finalidadeTipada = isTokenFinalidade(finalidade) ? finalidade : null;
  const alvoIdTexto = typeof alvo_id === "string" ? alvo_id.trim() : "";
  if (finalidadeTipada && !alvoIdTexto) {
    return jsonResponse(400, { ok: false, error: "ALVO_OBRIGATORIO" }, req, corsMode);
  }

  if (typeof senha !== "string" || !senha) {
    return jsonResponse(400, { ok: false, error: "SENHA_OBRIGATORIA" }, req, corsMode);
  }
  const senhaNormalizada = senha.trim();
  if (!senhaNormalizada || senhaNormalizada.length > 128) {
    return jsonResponse(400, { ok: false, error: "SENHA_INVALIDA_FORMATO" }, req, corsMode);
  }

  // Configurações do Supabase (service role para acessar pdv_config)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    log({ level: "error", stage: "config", error: "MISSING_ENV" });
    return jsonResponse(500, { ok: false, error: "CONFIG_ERROR" }, req, corsMode);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    const bearer =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";
    if (!bearer) {
      log({ level: "warn", stage: "auth", error: "MISSING_BEARER" });
      return jsonResponse(401, { ok: false, error: "UNAUTHORIZED" }, req, corsMode);
    }

    const { data: authData, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !authData.user) {
      log({
        level: "warn",
        stage: "auth",
        error: "INVALID_BEARER",
        detail: authErr?.message ?? null,
      });
      return jsonResponse(401, { ok: false, error: "UNAUTHORIZED" }, req, corsMode);
    }

    // SEC-04 (multiempresa): loja decidida no servidor; o corpo só escolhe entre as lojas permitidas.
    const escopo = await resolverEscopoGerente(
      supabase,
      authData.user.id,
      typeof loja_id === "string" ? loja_id : null,
    );
    if (!escopo.ok) {
      log({ level: "warn", stage: "auth", error: escopo.error });
      return jsonResponse(403, { ok: false, error: escopo.error }, req, corsMode);
    }

    const result = await validateGerenteAndIssueToken({
      supabase,
      senha: senhaNormalizada,
      lojaId: escopo.lojaId,
      empresaId: escopo.empresaId,
      userId: authData.user.id,
      req,
      logStage: "auth",
      log: log,
      limits: {
        user: USER_LIMIT,
        ip: IP_LIMIT,
        device: DEVICE_LIMIT,
        global: GLOBAL_LIMIT,
      },
      tokenCreatedBy: authData.user.id,
      persistAuthAttemptsByUser: true,
      finalidade: finalidadeTipada,
      alvoId: finalidadeTipada ? alvoIdTexto : null,
    });
    return jsonResponse(result.status, result.body, req, corsMode);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    log({ level: "error", stage: "runtime", error: errorMsg });
    return jsonResponse(500, { ok: false, error: "ERRO_INTERNO" }, req, corsMode);
  }
});
