// Edge Function: validar-gerente
// Valida senha do gerente contra hash armazenado no banco (tabela pdv_config)
// Retorna token temporário de desconto se válido, ou erro se inválido
//
// Contrato:
// POST /functions/v1/validar-gerente
// Header: Authorization: Bearer <jwt> (usuário autenticado)
// Body: { senha: string, loja_id?: string }
// Response: { ok: true, token: string, expira_em: string } | { ok: false, error: string }

import { createClient } from "npm:@supabase/supabase-js";

const encoder = new TextEncoder();
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOCK_MS = 15 * 60 * 1000; // 15 min
const USER_LIMIT = 5;
const IP_LIMIT = 20;
const DEVICE_LIMIT = 10;
const GLOBAL_LIMIT = 60;
const UNKNOWN_IP = "unknown-ip";
const UNKNOWN_DEVICE = "unknown-device";

type RateScope = "USER" | "IP" | "DEVICE" | "GLOBAL";

type RateContext = {
  scope: RateScope;
  identifier: string;
  limit: number;
};

type RateLimitRow = {
  failed_count: number;
  first_attempt_at: string;
  lock_until: string | null;
};

/** Gera hash SHA-256 da senha */
async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante (timing-safe) */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

/** Gera token aleatório seguro */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Log estruturado */
function logJson(payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), svc: "validar-gerente", ...payload })
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized.slice(0, 200) : fallback;
}

function extractClientIp(req: Request): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return normalizeIdentifier(cfIp, UNKNOWN_IP);
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return UNKNOWN_IP;
  const firstIp = forwarded.split(",")[0] ?? "";
  return normalizeIdentifier(firstIp, UNKNOWN_IP);
}

function extractDeviceFingerprint(req: Request): string {
  const fromHeader = req.headers.get("x-device-fingerprint");
  return normalizeIdentifier(fromHeader ?? "", UNKNOWN_DEVICE);
}

async function getRateLimitRow(
  supabase: ReturnType<typeof createClient>,
  ctx: RateContext,
): Promise<RateLimitRow | null> {
  const { data, error } = await supabase
    .from("gerente_auth_rate_limits")
    .select("failed_count, first_attempt_at, lock_until")
    .eq("scope", ctx.scope)
    .eq("identifier", ctx.identifier)
    .maybeSingle();
  if (error) throw new Error(`RATE_LIMIT_READ_FAILED:${ctx.scope}:${error.message}`);
  return data as RateLimitRow | null;
}

function isLocked(lockUntil: string | null, nowMs: number): boolean {
  if (!lockUntil) return false;
  const lockMs = Date.parse(lockUntil);
  return Number.isFinite(lockMs) && lockMs > nowMs;
}

async function registerFailure(
  supabase: ReturnType<typeof createClient>,
  ctx: RateContext,
  row: RateLimitRow | null,
  now: Date,
) {
  const nowMs = now.getTime();
  const firstAttemptMs = row?.first_attempt_at ? Date.parse(row.first_attempt_at) : NaN;
  const insideWindow =
    Number.isFinite(firstAttemptMs) && nowMs - firstAttemptMs <= RATE_WINDOW_MS;

  const failedCount = insideWindow ? (row?.failed_count ?? 0) + 1 : 1;
  const firstAttemptAt = insideWindow && row?.first_attempt_at
    ? row.first_attempt_at
    : now.toISOString();
  const lockUntil = failedCount >= ctx.limit
    ? new Date(nowMs + LOCK_MS).toISOString()
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

async function resetRateLimit(
  supabase: ReturnType<typeof createClient>,
  ctx: RateContext,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    logJson({ level: "warn", stage: "http", error: "METHOD_NOT_ALLOWED" });
    return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // Parse do body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logJson({ level: "warn", stage: "http", error: "INVALID_JSON" });
    return jsonResponse(400, { ok: false, error: "INVALID_JSON" });
  }

  // Validação do payload
  if (typeof body !== "object" || body === null) {
    return jsonResponse(400, { ok: false, error: "INVALID_BODY" });
  }

  const { senha, loja_id } = body as { senha?: unknown; loja_id?: unknown };

  if (typeof senha !== "string" || !senha) {
    return jsonResponse(400, { ok: false, error: "SENHA_OBRIGATORIA" });
  }
  const senhaNormalizada = senha.trim();
  if (!senhaNormalizada || senhaNormalizada.length > 128) {
    return jsonResponse(400, { ok: false, error: "SENHA_INVALIDA_FORMATO" });
  }

  // Configurações do Supabase (service role para acessar pdv_config)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    logJson({ level: "error", stage: "config", error: "MISSING_ENV" });
    return jsonResponse(500, { ok: false, error: "CONFIG_ERROR" });
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
      logJson({ level: "warn", stage: "auth", error: "MISSING_BEARER" });
      return jsonResponse(401, { ok: false, error: "UNAUTHORIZED" });
    }

    const { data: authData, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !authData.user) {
      logJson({
        level: "warn",
        stage: "auth",
        error: "INVALID_BEARER",
        detail: authErr?.message ?? null,
      });
      return jsonResponse(401, { ok: false, error: "UNAUTHORIZED" });
    }

    const userId = authData.user.id;
    const now = new Date();
    const nowIso = now.toISOString();
    const clientIp = extractClientIp(req);
    const deviceFingerprint = extractDeviceFingerprint(req);
    const rateContexts: RateContext[] = [
      { scope: "USER", identifier: userId, limit: USER_LIMIT },
      { scope: "IP", identifier: clientIp, limit: IP_LIMIT },
      { scope: "DEVICE", identifier: deviceFingerprint, limit: DEVICE_LIMIT },
      { scope: "GLOBAL", identifier: "global", limit: GLOBAL_LIMIT },
    ];

    for (const ctx of rateContexts) {
      const row = await getRateLimitRow(supabase, ctx);
      if (isLocked(row?.lock_until ?? null, now.getTime())) {
        logJson({
          level: "warn",
          stage: "rate_limit",
          event: "locked_precheck",
          scope: ctx.scope,
          identifier: ctx.identifier,
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

    // Busca configuração do PDV (senha hash e limite de desconto)
    const { data: config, error: configError } = await supabase
      .from("pdv_config")
      .select("gerente_senha_sha256, max_desconto_gerente_percentual")
      .eq("id", 1)
      .maybeSingle();

    if (configError) {
      logJson({
        level: "error",
        stage: "db",
        error: configError.message,
      });
      return jsonResponse(500, { ok: false, error: "ERRO_DB_CONFIG" });
    }

    if (!config || !config.gerente_senha_sha256) {
      logJson({
        level: "error",
        stage: "config",
        error: "CONFIG_NAO_ENCONTRADA",
      });
      return jsonResponse(500, { ok: false, error: "CONFIG_NAO_ENCONTRADA" });
    }

    // Calcula hash da senha fornecida
    const senhaHash = await sha256Hex(senhaNormalizada);

    // Comparação timing-safe
    if (!timingSafeEqualStr(senhaHash, config.gerente_senha_sha256)) {
      let lockScope: RateScope | null = null;
      let lockUntil: string | null = null;
      for (const ctx of rateContexts) {
        const row = await getRateLimitRow(supabase, ctx);
        const result = await registerFailure(supabase, ctx, row, now);
        logJson({
          level: "warn",
          stage: "rate_limit",
          event: "failed_attempt",
          scope: ctx.scope,
          identifier: ctx.identifier,
          failed_count: result.failedCount,
          lock_until: result.lockUntil,
        });
        if (result.blockedNow && !lockScope) {
          lockScope = ctx.scope;
          lockUntil = result.lockUntil;
        }
      }

      await supabase.from("gerente_auth_attempts").upsert({
        user_id: userId,
        failed_count: 1,
        lock_until: lockUntil,
        updated_at: nowIso,
      });
      logJson({
        level: "warn",
        stage: "auth",
        error: "SENHA_INVALIDA",
        loja_id: loja_id || null,
        ip: clientIp,
        device: deviceFingerprint,
        rate_scope: lockScope,
      });
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

    // Senha válida! Gera token temporário
    const token = generateToken();
    const expiraEm = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos

    // Registra token no banco (opcional - para auditoria e revogação)
    const { error: insertError } = await supabase.from("tokens_desconto_gerente").insert({
      token,
      expira_em: expiraEm,
      usado: false,
      loja_id: typeof loja_id === "string" ? loja_id : null,
      criado_por: authData.user.id,
    });

    if (insertError) {
      logJson({
        level: "error",
        stage: "db",
        error: insertError.message,
      });
      // Não falha a requisição, apenas loga o erro
    }

    for (const ctx of rateContexts) {
      await resetRateLimit(supabase, ctx, nowIso);
    }
    await supabase.from("gerente_auth_attempts").upsert({
      user_id: userId,
      failed_count: 0,
      lock_until: null,
      updated_at: nowIso,
    });

    logJson({
      level: "info",
      stage: "auth",
      success: true,
      loja_id: loja_id || null,
      ip: clientIp,
      device: deviceFingerprint,
    });

    return jsonResponse(200, {
      ok: true,
      token,
      expira_em: expiraEm,
      max_desconto_percentual: config.max_desconto_gerente_percentual || 20,
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    logJson({ level: "error", stage: "runtime", error: errorMsg });
    return jsonResponse(500, { ok: false, error: "ERRO_INTERNO" });
  }
});
