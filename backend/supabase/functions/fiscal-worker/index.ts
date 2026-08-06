import { createClient } from "@supabase/supabase-js";
import { timingSafeEqualSecret } from "../_shared/crypto.ts";
import { classifyFiscalError } from "./fiscal_classify.ts";
import type { FiscalDoc } from "./fiscal_types.ts";
import { isRecord, json } from "./fiscal_http.ts";
import { callProvider, type ProviderConfig } from "./fiscal-provider-adapter.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const workerKey = Deno.env.get("FISCAL_WORKER_KEY");
  const gotKey = req.headers.get("X-FISCAL-WORKER-KEY")?.trim();
  if (!workerKey?.trim() || !gotKey || !(await timingSafeEqualSecret(workerKey, gotKey))) {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return json(500, { ok: false, error: "MISSING_SUPABASE_ENV" });
  }
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  let limit = 20;
  try {
    const body = await req.json().catch(() => ({}));
    if (isRecord(body) && typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(100, Math.floor(body.limit)));
    }
  } catch {
    // ignora e usa limit default
  }

  const providerType = (Deno.env.get("FISCAL_PROVIDER_TYPE") ?? "mock").toLowerCase() as ProviderConfig["type"];
  const providerUrl = Deno.env.get("FISCAL_PROVIDER_URL") ?? "";
  const providerToken = Deno.env.get("FISCAL_PROVIDER_TOKEN") ?? null;
  const timeoutMsRaw = Number(Deno.env.get("FISCAL_PROVIDER_TIMEOUT_MS") ?? "10000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
    ? Math.floor(timeoutMsRaw)
    : 10000;

  // D-3: janela para considerar um EM_PROCESSAMENTO órfão e teto de tentativas
  // antes da DLQ. Default conservador (15 min / 5 tentativas), sobrescrevível por env.
  const reaperTimeoutRaw = Number(Deno.env.get("FISCAL_REAPER_TIMEOUT_MINUTOS") ?? "15");
  const reaperTimeoutMin = Number.isFinite(reaperTimeoutRaw) && reaperTimeoutRaw > 0
    ? Math.min(1440, Math.floor(reaperTimeoutRaw))
    : 15;
  const reaperMaxRaw = Number(Deno.env.get("FISCAL_REAPER_MAX_TENTATIVAS") ?? "5");
  const reaperMaxTentativas = Number.isFinite(reaperMaxRaw) && reaperMaxRaw > 0
    ? Math.min(20, Math.floor(reaperMaxRaw))
    : 5;

  const providerConfig: ProviderConfig = {
    type: providerType,
    url: providerUrl || undefined,
    token: providerToken || undefined,
    timeout: timeoutMs,
  };

  if ((providerType === "http" || providerType === "focus") && !providerUrl.trim()) {
    return json(500, { ok: false, error: "MISSING_PROVIDER_URL" });
  }

  // D-3: antes de reivindicar novos documentos, resgata os que ficaram presos em
  // EM_PROCESSAMENTO por morte do worker (timeout de Edge Function, deploy, crash).
  // Sem isto nem o retry automático nem o reprocesso manual alcançam esses órfãos.
  // O reaper é o único ponto de agendamento: roda junto com o worker, não em cron próprio.
  let reaped: { reenfileirados: number; enviados_dlq: number } | null = null;
  const { data: reaperData, error: reaperErr } = await supabase.rpc("fiscal_reaper_documentos", {
    p_timeout_minutos: reaperTimeoutMin,
    p_max_tentativas: reaperMaxTentativas,
  });
  if (reaperErr) {
    // Falha do reaper não derruba a emissão: apenas fica registrada.
    console.error(
      JSON.stringify({
        scope: "fiscal-worker",
        event: "fiscal_reaper_failed",
        message: reaperErr.message,
      }),
    );
  } else {
    const row = Array.isArray(reaperData) ? reaperData[0] : reaperData;
    if (isRecord(row)) {
      reaped = {
        reenfileirados: Number(row.reenfileirados ?? 0),
        enviados_dlq: Number(row.enviados_dlq ?? 0),
      };
      if (reaped.reenfileirados > 0 || reaped.enviados_dlq > 0) {
        console.log(
          JSON.stringify({ scope: "fiscal-worker", event: "fiscal_reaper_ran", ...reaped }),
        );
      }
    }
  }

  const { data: docs, error: claimErr } = await supabase.rpc("fiscal_claim_documentos", {
    p_limit: limit,
  });
  if (claimErr) {
    return json(500, { ok: false, error: `CLAIM_ERROR:${claimErr.message}` });
  }

  const processed: string[] = [];
  const emitted: string[] = [];
  const failed: Array<{ id: string; erro: string }> = [];
  const retried: Array<{ id: string; proxima_tentativa: string | null }> = [];

  for (const raw of (docs ?? []) as Array<Record<string, unknown>>) {
    const doc: FiscalDoc = {
      id: String(raw.id),
      venda_id: String(raw.venda_id),
      tipo_doc: String(raw.tipo_doc),
      correlation_id: typeof raw.correlation_id === "string" ? raw.correlation_id : undefined,
      payload: raw.payload && isRecord(raw.payload) ? raw.payload : null,
    };
    processed.push(doc.id);

    const result = await callProvider(doc, providerConfig);

    if (result.ok) {
      const { error } = await supabase.rpc("fiscal_marcar_emitido", {
        p_documento_id: doc.id,
        p_chave_fiscal: result.chave_fiscal,
        p_protocolo: result.protocolo,
        p_provider_ref: result.provider_ref ?? null,
        p_payload: result.payload ?? null,
      });
      if (error) {
        failed.push({ id: doc.id, erro: `MARCAR_EMITIDO_ERROR:${error.message}` });
        const { error: retryErr } = await supabase.rpc("fiscal_marcar_erro", {
          p_documento_id: doc.id,
          p_erro: `MARCAR_EMITIDO_ERROR:${error.message}`,
          p_transitorio: true,
        });
        if (retryErr) {
          console.error(
            JSON.stringify({
              scope: "fiscal-worker",
              event: "fiscal_marcar_erro_failed",
              correlation_id: doc.correlation_id ?? null,
              documento_id: doc.id,
              message: retryErr.message,
            }),
          );
        } else {
          const { data: row } = await supabase
            .from("documentos_fiscais_pendentes")
            .select("proxima_tentativa_em")
            .eq("id", doc.id)
            .maybeSingle();
          retried.push({
            id: doc.id,
            proxima_tentativa: row?.proxima_tentativa_em ?? null,
          });
        }
      } else {
        emitted.push(doc.id);
      }
    } else if (result.transitorio) {
      const { error: retryErr } = await supabase.rpc("fiscal_marcar_erro", {
        p_documento_id: doc.id,
        p_erro: result.erro,
        p_transitorio: true,
      });
      if (retryErr) {
        failed.push({ id: doc.id, erro: `MARCAR_ERRO:${retryErr.message}` });
      } else {
        const { data: row } = await supabase
          .from("documentos_fiscais_pendentes")
          .select("proxima_tentativa_em")
          .eq("id", doc.id)
          .maybeSingle();
        retried.push({
          id: doc.id,
          proxima_tentativa: row?.proxima_tentativa_em ?? null,
        });
      }
    } else {
      failed.push({ id: doc.id, erro: result.erro });
      const normalized = classifyFiscalError({
        erro: result.erro,
        transitorio: result.transitorio,
        httpStatus: result.http_status,
        providerCode: result.provider_code,
        providerMessage: result.provider_message,
        payload: result.payload,
      });
      const { error: normErr } = await supabase.rpc("fiscal_marcar_erro_normalizado", {
        p_documento_id: doc.id,
        p_erro: result.erro,
        p_transitorio: false,
        p_error_code: normalized.error_code,
        p_error_category: normalized.error_category,
        p_action_hint: normalized.action_hint,
        p_retryable: false,
        p_next_step_url: normalized.next_step_url,
        p_error_payload: normalized.details,
      });
      if (normErr) {
        console.error(
          JSON.stringify({
            scope: "fiscal-worker",
            event: "fiscal_marcar_erro_normalizado_failed",
            correlation_id: doc.correlation_id ?? null,
            documento_id: doc.id,
            message: normErr.message,
          }),
        );
      }
    }
  }

  return json(200, {
    ok: true,
    provider_type: providerType,
    reaped,
    claimed: (docs ?? []).length,
    processed,
    emitted,
    failed,
    retried,
  });
});
