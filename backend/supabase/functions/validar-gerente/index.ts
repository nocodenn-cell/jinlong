// Edge Function: validar-gerente
// Valida senha do gerente contra hash armazenado no banco (tabela pdv_config)
// Retorna token temporário de desconto se válido, ou erro se inválido
//
// Contrato:
// POST /functions/v1/validar-gerente
// Body: { senha: string, loja_id?: string }
// Response: { ok: true, token: string, expira_em: string } | { ok: false, error: string }

import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();

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
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
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
    // Busca configuração do PDV (senha hash e limite de desconto)
    const { data: config, error: configError } = await supabase
      .from("pdv_config")
      .select("gerente_senha_sha256, max_desconto_gerente_percentual")
      .eq("id", "default")
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
    const senhaHash = await sha256Hex(senha);

    // Comparação timing-safe
    if (!timingSafeEqualStr(senhaHash, config.gerente_senha_sha256)) {
      logJson({
        level: "warn",
        stage: "auth",
        error: "SENHA_INVALIDA",
        loja_id: loja_id || null,
      });
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
    });

    if (insertError) {
      logJson({
        level: "error",
        stage: "db",
        error: insertError.message,
      });
      // Não falha a requisição, apenas loga o erro
    }

    logJson({
      level: "info",
      stage: "auth",
      success: true,
      loja_id: loja_id || null,
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
