import { timingSafeEqualStr } from "./crypto.ts";

const encoder = new TextEncoder();

const RATE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const TOKEN_TTL_MS = 5 * 60 * 1000;
const UNKNOWN_IP = "unknown-ip";
const UNKNOWN_DEVICE = "unknown-device";

export type GerenteRateScope = "USER" | "IP" | "DEVICE" | "GLOBAL";

type GerenteRateContext = {
  scope: GerenteRateScope;
  identifier: string;
  limit: number;
};

type GerenteRateLimitRow = {
  failed_count: number;
  first_attempt_at: string;
  lock_until: string | null;
};

type LoggerFn = (payload: Record<string, unknown>) => void;

type ValidateOptions = {
  supabase: any;
  senha: string;
  lojaId: string | null;
  userId?: string | null;
  req: Request;
  logStage: string;
  log: LoggerFn;
  limits: {
    user?: number;
    ip: number;
    device: number;
    global: number;
  };
  tokenCreatedBy: string | null;
  persistAuthAttemptsByUser: boolean;
};

type ValidateResult =
  | {
    ok: true;
    status: 200;
    body: {
      ok: true;
      token: string;
      expira_em: string;
      max_desconto_percentual: number;
      gerente_id: string;
    };
  }
  | {
    ok: false;
    status: 401 | 429 | 500 | 503;
    body: Record<string, unknown>;
  };

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

async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getRateLimitRow(
  supabase: any,
  ctx: GerenteRateContext,
): Promise<GerenteRateLimitRow | null> {
  const { data, error } = await supabase
    .from("gerente_auth_rate_limits")
    .select("failed_count, first_attempt_at, lock_until")
    .eq("scope", ctx.scope)
    .eq("identifier", ctx.identifier)
    .maybeSingle();
  if (error) throw new Error(`RATE_LIMIT_READ_FAILED:${ctx.scope}:${error.message}`);
  return data as GerenteRateLimitRow | null;
}

function isLocked(lockUntil: string | null, nowMs: number): boolean {
  if (!lockUntil) return false;
  const lockMs = Date.parse(lockUntil);
  return Number.isFinite(lockMs) && lockMs > nowMs;
}

async function registerFailure(
  supabase: any,
  ctx: GerenteRateContext,
  row: GerenteRateLimitRow | null,
  now: Date,
) {
  const nowMs = now.getTime();
  const firstAttemptMs = row?.first_attempt_at ? Date.parse(row.first_attempt_at) : Number.NaN;
  const insideWindow = Number.isFinite(firstAttemptMs) && nowMs - firstAttemptMs <= RATE_WINDOW_MS;

  const failedCount = insideWindow ? (row?.failed_count ?? 0) + 1 : 1;
  const firstAttemptAt = insideWindow && row?.first_attempt_at
    ? row.first_attempt_at
    : now.toISOString();
  const lockUntil = failedCount >= ctx.limit ? new Date(nowMs + LOCK_MS).toISOString() : null;

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
  supabase: any,
  ctx: GerenteRateContext,
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

async function precheckRateLimitLocks(
  supabase: any,
  rateContexts: GerenteRateContext[],
  nowMs: number,
  logStage: string,
  log: LoggerFn,
): Promise<ValidateResult | null> {
  for (const ctx of rateContexts) {
    const row = await getRateLimitRow(supabase, ctx);
    if (!isLocked(row?.lock_until ?? null, nowMs)) continue;
    log({
      level: "warn",
      stage: logStage,
      event: "locked_precheck",
      scope: ctx.scope,
      identifier: ctx.identifier,
      lock_until: row?.lock_until ?? null,
    });
    return {
      ok: false,
      status: 429,
      body: {
        ok: false,
        error: "LOCKED_TEMPORARILY",
        scope: ctx.scope,
        lock_until: row?.lock_until ?? null,
      },
    };
  }
  return null;
}

type GerenteConfigBundle = {
  config: { gerente_id: string; gerente_senha_sha256: string; max_desconto_gerente_percentual: unknown };
  gerenteIdRaw: string;
};

async function loadGerenteConfigBundle(
  supabase: any,
  logStage: string,
  log: LoggerFn,
): Promise<GerenteConfigBundle | ValidateResult> {
  const { data: config, error: configError } = await supabase
    .from("pdv_config")
    .select("gerente_id, gerente_senha_sha256, max_desconto_gerente_percentual")
    .eq("id", 1)
    .maybeSingle();

  if (configError) {
    log({ level: "error", stage: logStage, error: configError.message });
    return { ok: false, status: 500, body: { ok: false, error: "ERRO_DB_CONFIG" } };
  }
  if (!config || !config.gerente_senha_sha256) {
    log({ level: "error", stage: logStage, error: "CONFIG_NAO_ENCONTRADA" });
    return { ok: false, status: 500, body: { ok: false, error: "CONFIG_NAO_ENCONTRADA" } };
  }
  const gerenteIdRaw = typeof config.gerente_id === "string" ? config.gerente_id.trim() : "";
  if (!gerenteIdRaw) {
    log({ level: "error", stage: logStage, error: "CONFIG_GERENTE_ID_AUSENTE" });
    return { ok: false, status: 500, body: { ok: false, error: "CONFIG_GERENTE_ID_AUSENTE" } };
  }
  const { data: gerenteUser, error: gerenteErr } = await supabase
    .from("usuarios")
    .select("id, perfil, ativo")
    .eq("id", gerenteIdRaw)
    .maybeSingle();
  if (gerenteErr) {
    log({ level: "error", stage: logStage, error: "GERENTE_LOOKUP_ERROR", detail: gerenteErr.message });
    return { ok: false, status: 500, body: { ok: false, error: "CONFIG_GERENTE_INVALIDA" } };
  }
  const perfilOk =
    gerenteUser?.ativo === true &&
    (gerenteUser.perfil === "GERENTE" || gerenteUser.perfil === "DONO" || gerenteUser.perfil === "ADMIN");
  if (!perfilOk) {
    log({ level: "error", stage: logStage, error: "CONFIG_GERENTE_INVALIDA" });
    return { ok: false, status: 500, body: { ok: false, error: "CONFIG_GERENTE_INVALIDA" } };
  }
  return { config, gerenteIdRaw };
}

async function respondSenhaGerenteInvalida(
  supabase: any,
  rateContexts: GerenteRateContext[],
  now: Date,
  logStage: string,
  log: LoggerFn,
  lojaId: string | null,
  clientIp: string,
  deviceFingerprint: string,
  persistAuthAttemptsByUser: boolean,
  userId: string | null | undefined,
  nowIso: string,
): Promise<ValidateResult> {
  let lockScope: GerenteRateScope | null = null;
  let lockUntil: string | null = null;

  for (const ctx of rateContexts) {
    const row = await getRateLimitRow(supabase, ctx);
    const result = await registerFailure(supabase, ctx, row, now);
    log({
      level: "warn",
      stage: logStage,
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

  if (persistAuthAttemptsByUser && userId) {
    await supabase.from("gerente_auth_attempts").upsert({
      user_id: userId,
      failed_count: 1,
      lock_until: lockUntil,
      updated_at: nowIso,
    });
  }

  log({
    level: "warn",
    stage: logStage,
    error: "SENHA_INVALIDA",
    loja_id: lojaId,
    ip: clientIp,
    device: deviceFingerprint,
    rate_scope: lockScope,
  });

  if (lockScope && lockUntil) {
    return {
      ok: false,
      status: 429,
      body: {
        ok: false,
        error: "LOCKED_TEMPORARILY",
        scope: lockScope,
        lock_until: lockUntil,
      },
    };
  }
  return { ok: false, status: 401, body: { ok: false, error: "SENHA_INVALIDA" } };
}

async function persistTokenAndResetLimits(
  supabase: any,
  token: string,
  expiraEm: string,
  lojaId: string | null,
  tokenCreatedBy: string | null,
  rateContexts: GerenteRateContext[],
  nowIso: string,
  persistAuthAttemptsByUser: boolean,
  userId: string | null | undefined,
  logStage: string,
  log: LoggerFn,
): Promise<ValidateResult | null> {
  const { error: insertError } = await supabase.from("tokens_desconto_gerente").insert({
    token,
    expira_em: expiraEm,
    usado: false,
    loja_id: lojaId,
    criado_por: tokenCreatedBy,
  });
  if (insertError) {
    log({ level: "error", stage: logStage, error: insertError.message });
    return { ok: false, status: 503, body: { ok: false, error: "ERRO_PERSISTENCIA_TOKEN" } };
  }

  for (const ctx of rateContexts) {
    await resetRateLimit(supabase, ctx, nowIso);
  }
  if (persistAuthAttemptsByUser && userId) {
    await supabase.from("gerente_auth_attempts").upsert({
      user_id: userId,
      failed_count: 0,
      lock_until: null,
      updated_at: nowIso,
    });
  }
  return null;
}

export async function validateGerenteAndIssueToken(
  options: ValidateOptions,
): Promise<ValidateResult> {
  const {
    supabase,
    senha,
    lojaId,
    userId,
    req,
    logStage,
    log,
    limits,
    tokenCreatedBy,
    persistAuthAttemptsByUser,
  } = options;

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const clientIp = extractClientIp(req);
  const deviceFingerprint = extractDeviceFingerprint(req);

  const rateContexts: GerenteRateContext[] = [];
  if (userId && limits.user) {
    rateContexts.push({ scope: "USER", identifier: userId, limit: limits.user });
  }
  rateContexts.push(
    { scope: "IP", identifier: clientIp, limit: limits.ip },
    { scope: "DEVICE", identifier: deviceFingerprint, limit: limits.device },
    { scope: "GLOBAL", identifier: "global", limit: limits.global },
  );

  try {
    const locked = await precheckRateLimitLocks(supabase, rateContexts, nowMs, logStage, log);
    if (locked) return locked;

    const bundleOrErr = await loadGerenteConfigBundle(supabase, logStage, log);
    if ("ok" in bundleOrErr) return bundleOrErr;
    const { config, gerenteIdRaw } = bundleOrErr;

    const senhaHash = await sha256Hex(senha);
    if (!timingSafeEqualStr(senhaHash, config.gerente_senha_sha256)) {
      return await respondSenhaGerenteInvalida(
        supabase,
        rateContexts,
        now,
        logStage,
        log,
        lojaId,
        clientIp,
        deviceFingerprint,
        persistAuthAttemptsByUser,
        userId,
        nowIso,
      );
    }

    const token = generateToken();
    const expiraEm = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const persistErr = await persistTokenAndResetLimits(
      supabase,
      token,
      expiraEm,
      lojaId,
      tokenCreatedBy,
      rateContexts,
      nowIso,
      persistAuthAttemptsByUser,
      userId,
      logStage,
      log,
    );
    if (persistErr) return persistErr;

    log({
      level: "info",
      stage: logStage,
      success: true,
      loja_id: lojaId,
      ip: clientIp,
      device: deviceFingerprint,
    });

    const maxPct = Number(config.max_desconto_gerente_percentual);
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        token,
        expira_em: expiraEm,
        max_desconto_percentual: Number.isFinite(maxPct) && maxPct > 0 ? maxPct : 20,
        gerente_id: gerenteIdRaw,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    log({ level: "error", stage: logStage, error: errorMsg });
    return { ok: false, status: 500, body: { ok: false, error: "ERRO_INTERNO" } };
  }
}
