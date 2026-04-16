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
import { validateGerenteAndIssueToken } from "../_shared/gerente-auth.ts";

const USER_LIMIT = 5;
const IP_LIMIT = 20;
const DEVICE_LIMIT = 10;
const GLOBAL_LIMIT = 60;

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

    const result = await validateGerenteAndIssueToken({
      supabase,
      senha: senhaNormalizada,
      lojaId: typeof loja_id === "string" ? loja_id : null,
      userId: authData.user.id,
      req,
      logStage: "auth",
      log: logJson,
      limits: {
        user: USER_LIMIT,
        ip: IP_LIMIT,
        device: DEVICE_LIMIT,
        global: GLOBAL_LIMIT,
      },
      tokenCreatedBy: authData.user.id,
      persistAuthAttemptsByUser: true,
    });
    return jsonResponse(result.status, result.body);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    logJson({ level: "error", stage: "runtime", error: errorMsg });
    return jsonResponse(500, { ok: false, error: "ERRO_INTERNO" });
  }
});
