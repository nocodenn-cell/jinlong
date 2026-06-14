import { createClient } from "@supabase/supabase-js";
import { timingSafeEqualSecret } from "../_shared/crypto.ts";
import { classifyFiscalError } from "./fiscal_classify.ts";
import type { FiscalDoc } from "./fiscal_types.ts";
import { isRecord, json } from "./fiscal_http.ts";
import { callProvider, type ProviderConfig } from "./fiscal-provider-adapter.ts";

const log = (event: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ scope: "fiscal-worker", event, ts: new Date().toISOString(), ...data }));

Deno.serve(async (req) => {
  const t0 = Date.now();

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const workerKey = Deno.env.get("FISCAL_WORKER_KEY");
  const gotKey = req.headers.get("X-FISCAL-WORKER-KEY")?.trim();
  const workerKeyPresent = !!workerKey?.trim();
  const gotKeyPresent = !!gotKey;
  const authOk = workerKeyPresent && gotKeyPresent && await timingSafeEqualSecret(workerKey!, gotKey!);

  if (!authOk) {
    log("auth_fail", {
      worker_key_present: workerKeyPresent,
      request_key_present: gotKeyPresent,
      reason: !workerKeyPresent
        ? "FISCAL_WORKER_KEY env ausente ou vazio"
        : !gotKeyPresent
        ? "header X-FISCAL-WORKER-KEY ausente na requisição"
        : "chaves não coincidem",
    });
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }
  log("auth_success", {});

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

  const providerConfig: ProviderConfig = {
    type: providerType,
    url: providerUrl || undefined,
    token: providerToken || undefined,
    timeout: timeoutMs,
  };

  if ((providerType === "http" || providerType === "focus") && !providerUrl.trim()) {
    return json(500, { ok: false, error: "MISSING_PROVIDER_URL" });
  }

  const { data: docs, error: claimErr } = await supabase.rpc("fiscal_claim_documentos", {
    p_limit: limit,
  });
  if (claimErr) {
    log("claim_error", { message: claimErr.message });
    return json(500, { ok: false, error: `CLAIM_ERROR:${claimErr.message}` });
  }

  const claimed = (docs ?? []).length;
  log("claim_ok", { claimed, limit, provider_type: providerType });

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

    const tDoc = Date.now();
    const result = await callProvider(doc, providerConfig);
    const providerMs = Date.now() - tDoc;

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
        log("doc_marcar_emitido_error", { documento_id: doc.id, correlation_id: doc.correlation_id ?? null, message: error.message });
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
          log("doc_retry_scheduled", { documento_id: doc.id, correlation_id: doc.correlation_id ?? null, proxima_tentativa: row?.proxima_tentativa_em ?? null });
        }
      } else {
        emitted.push(doc.id);
        log("doc_emitted", { documento_id: doc.id, correlation_id: doc.correlation_id ?? null, tipo_doc: doc.tipo_doc, provider_ms: providerMs });
      }
    } else if (result.transitorio) {
      log("doc_retry", { documento_id: doc.id, correlation_id: doc.correlation_id ?? null, erro: result.erro, provider_ms: providerMs });
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
      log("doc_failed", { documento_id: doc.id, correlation_id: doc.correlation_id ?? null, erro: result.erro, provider_code: result.provider_code ?? null, http_status: result.http_status ?? null, provider_ms: providerMs });
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

  const totalMs = Date.now() - t0;
  log("run_complete", { claimed, emitted: emitted.length, failed: failed.length, retried: retried.length, provider_type: providerType, total_ms: totalMs });

  return json(200, {
    ok: true,
    provider_type: providerType,
    claimed,
    processed,
    emitted,
    failed,
    retried,
  });
});
