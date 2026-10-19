// @types/bcryptjs usa `export =` (sem default export), entao import default
// falha no type-check (TS1192). Porem, em runtime (Deno/esm.sh) o modulo CJS
// chega como `{ default: { compareSync, ... } }` — os metodos NAO ficam no topo
// do namespace. Ou seja: `import * as bcrypt` type-checa, mas
// `bcrypt.compareSync` e `undefined` quando executa.
//
// Foi esse o efeito de 680984c7 ("Runtime identico" na mensagem do commit era
// incorreto): `bcrypt.compareSync is not a function` derrubou toda autorizacao
// de gerente que passa por este helper. Falha fechada — negava sempre, nunca
// autorizou indevidamente.
//
// Import namespace (satisfaz o type-check) + acesso via `.default` (shape real
// do runtime) resolve os dois lados.
import * as bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const bcryptImpl = (bcrypt as unknown as { default: typeof bcrypt }).default;

/**
 * Compara a senha em claro com o hash bcrypt do gerente.
 *
 * Isolada e exportada para que o teste de regressao exercite exatamente o
 * caminho usado em producao — o bug de 680984c7 passou porque nao havia
 * nenhum teste tocando esta linha.
 */
export function verificarSenhaGerenteBcrypt(senha: string, hash: string): boolean {
  return bcryptImpl.compareSync(senha, hash);
}

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
  /** Empresa da operação (multiempresa): escolhe a linha padrão de pdv_config DA EMPRESA (senha de gerente). */
  empresaId?: string | null;
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
  /**
   * Finalidade tipada da autorização. Quando informada, o token é gravado em
   * `tokens_autorizacao_operacao` (tabela separada) preso a finalidade + alvo +
   * loja + gerente aprovador. Ausente = token legado, sem finalidade, gravado em
   * `tokens_desconto_gerente` (desconto de venda, limite de crédito, retomada).
   */
  finalidade?: TokenFinalidade | null;
  /**
   * Identidade da operação autorizada. Obrigatória quando `finalidade` é
   * informada. Sangria: id da movimentação. Pagamento AP:
   * `ap:<conta_id>:<idempotency_key>` — a mesma chave de idempotência que o
   * banco deriva e grava na movimentação.
   */
  alvoId?: string | null;
};

export type TokenFinalidade = "SANGRIA" | "PAGAMENTO_AP";

const FINALIDADES_VALIDAS: readonly string[] = ["SANGRIA", "PAGAMENTO_AP"];

export function isTokenFinalidade(valor: unknown): valor is TokenFinalidade {
  return typeof valor === "string" && FINALIDADES_VALIDAS.includes(valor);
}

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
    // 400/403: recusas do contrato tipado (alvo ausente, solicitante inválido).
    status: 400 | 401 | 403 | 429 | 500 | 503;
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

function isBcryptHash(hash: unknown): hash is string {
  if (typeof hash !== "string") return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
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
  config: {
    gerente_id: string;
    gerente_senha_bcrypt: string | null;
    max_desconto_gerente_percentual: unknown;
  };
  gerenteIdRaw: string;
};

async function loadGerenteConfigBundle(
  supabase: any,
  logStage: string,
  log: LoggerFn,
  empresaId: string | null = null,
): Promise<GerenteConfigBundle | ValidateResult> {
  const COLS = "gerente_id, gerente_senha_bcrypt, max_desconto_gerente_percentual";
  // Multiempresa: senha de gerente é da EMPRESA da operação (linha padrão loja_id NULL da empresa).
  // Sem empresa (legado) ou coluna ainda inexistente ⇒ linha id=1, como antes (cliente 1).
  let res = empresaId
    ? await supabase.from("pdv_config").select(COLS).is("loja_id", null).eq("empresa_id", empresaId).maybeSingle()
    : await supabase.from("pdv_config").select(COLS).eq("id", 1).maybeSingle();
  if (empresaId && res.error && /empresa_id/.test(String(res.error.message))) {
    res = await supabase.from("pdv_config").select(COLS).eq("id", 1).maybeSingle();
  }
  const { data: config, error: configError } = res;

  if (configError) {
    log({ level: "error", stage: logStage, error: configError.message });
    return { ok: false, status: 500, body: { ok: false, error: "ERRO_DB_CONFIG" } };
  }
  const hasBcrypt = isBcryptHash(config?.gerente_senha_bcrypt);
  if (!config || !hasBcrypt) {
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
  finalidade: TokenFinalidade | null,
  alvoId: string | null,
  gerenteAprovadorId: string,
  lojaOperacaoId: string | null,
): Promise<ValidateResult | null> {
  // Token TIPADO (sangria / pagamento AP): vai para a tabela separada, preso a
  // finalidade + alvo + loja + gerente aprovador.
  //
  // `gerenteAprovadorId` vem de `pdv_config.gerente_id`, já validado (ativo e com
  // perfil aprovador) — é quem de fato teve a senha conferida. NÃO usar
  // `tokenCreatedBy`: aquele é o usuário autenticado que PEDIU a autorização, ou
  // seja, o operador solicitante. Confundir os dois registrava o solicitante como
  // aprovador da própria operação.
  //
  // A loja é derivada do servidor (`lojaOperacaoId`), não do corpo da requisição.
  const insertResult = finalidade
    ? await supabase.from("tokens_autorizacao_operacao").insert({
      token,
      finalidade,
      alvo_id: alvoId,
      loja_id: lojaOperacaoId,
      gerente_id: gerenteAprovadorId,
      solicitante_id: tokenCreatedBy,
      expira_em: expiraEm,
      usado: false,
    })
    : await supabase.from("tokens_desconto_gerente").insert({
      token,
      expira_em: expiraEm,
      usado: false,
      loja_id: lojaId,
      criado_por: tokenCreatedBy,
    });
  const { error: insertError } = insertResult;
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
    empresaId,
    userId,
    req,
    logStage,
    log,
    limits,
    tokenCreatedBy,
    persistAuthAttemptsByUser,
    finalidade,
    alvoId,
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

    const bundleOrErr = await loadGerenteConfigBundle(supabase, logStage, log, empresaId ?? null);
    if ("ok" in bundleOrErr) return bundleOrErr;
    const { config, gerenteIdRaw } = bundleOrErr;

    let senhaValida = false;
    const bcryptHash = typeof config.gerente_senha_bcrypt === "string" ? config.gerente_senha_bcrypt : "";
    if (isBcryptHash(bcryptHash)) {
      senhaValida = verificarSenhaGerenteBcrypt(senha, bcryptHash);
    } else {
      log({
        level: "error",
        stage: logStage,
        error: "CONFIG_HASH_INSEGURO",
      });
      return { ok: false, status: 500, body: { ok: false, error: "CONFIG_HASH_INSEGURO" } };
    }
    if (!senhaValida) {
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

    // Token tipado exige alvo e loja. A loja NÃO vem do corpo da requisição: é
    // lida do cadastro do solicitante, para que o cliente não escolha o tenant.
    let lojaOperacaoId: string | null = null;
    if (finalidade) {
      if (!alvoId || !alvoId.trim()) {
        log({ level: "error", stage: logStage, error: "ALVO_OBRIGATORIO" });
        return { ok: false, status: 400, body: { ok: false, error: "ALVO_OBRIGATORIO" } };
      }
      if (!userId) {
        log({ level: "error", stage: logStage, error: "SOLICITANTE_OBRIGATORIO" });
        return { ok: false, status: 401, body: { ok: false, error: "SOLICITANTE_OBRIGATORIO" } };
      }
      const { data: solicitante, error: solicitanteErr } = await supabase
        .from("usuarios")
        .select("loja_id, ativo")
        .eq("id", userId)
        .maybeSingle();
      if (solicitanteErr || !solicitante?.ativo || !solicitante?.loja_id) {
        log({ level: "error", stage: logStage, error: "SOLICITANTE_INVALIDO" });
        return { ok: false, status: 403, body: { ok: false, error: "SOLICITANTE_INVALIDO" } };
      }
      lojaOperacaoId = solicitante.loja_id as string;
    }

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
      finalidade ?? null,
      alvoId?.trim() ?? null,
      gerenteIdRaw,
      lojaOperacaoId,
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
