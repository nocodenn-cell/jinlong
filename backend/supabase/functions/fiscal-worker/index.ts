import { createClient } from "@supabase/supabase-js";
import { timingSafeEqualSecret } from "../_shared/crypto.ts";
import { classifyFiscalError } from "./fiscal_classify.ts";
import type { FiscalDoc } from "./fiscal_types.ts";
import { isRecord, json } from "./fiscal_http.ts";
import { callProvider, createFiscalProvider, resolveFocusRef, type ProviderConfig } from "./fiscal-provider-adapter.ts";
import { resolveDeployAmbiente, resolveFocusBaseUrl, resolveFocusCredential } from "./fiscal_credential_resolver.ts";
import { applyCredentialResolutionFailure, applyFocusRemoteState, enforceRetrySafeGate, extractLojaId, type WorkerCounters } from "./fiscal_worker_orchestration.ts";

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

  // Mecanismo legado (mock/http/bling) — inalterado desde antes da C2. Só
  // usado quando o tipo efetivo NÃO é "focus" (ver resolução por documento
  // abaixo, C2.1). FISCAL_PROVIDER_URL/FISCAL_PROVIDER_TOKEN nunca são lidos
  // no caminho "focus" — não há fallback silencioso possível.
  const legacyProviderConfig: ProviderConfig = {
    type: providerType,
    url: providerUrl || undefined,
    token: providerToken || undefined,
    timeout: timeoutMs,
  };

  if (providerType === "http" && !providerUrl.trim()) {
    return json(500, { ok: false, error: "MISSING_PROVIDER_URL" });
  }

  // C2.2 — ambiente é validado ANTES de qualquer claim/HTTP quando o worker
  // opera em modo "focus". URL base nunca vem de env var livre nem de
  // payload/domínio — só da ambiente confirmada aqui (ver resolveFocusBaseUrl).
  let deployAmbiente: "homologacao" | "producao" | null = null;
  if (providerType === "focus") {
    deployAmbiente = resolveDeployAmbiente(Deno.env.get("FISCAL_ENVIRONMENT"));
    if (!deployAmbiente) {
      return json(500, { ok: false, error: "FISCAL_AMBIENTE_INVALIDO" });
    }
  }

  // C2.8 — reconciliação: modo explícito, capacidade separada do laço de
  // claim/emissão abaixo. Não confundir com o reaper (recuperação de
  // processamento local preso, já existente) — aqui é descoberta do estado
  // REMOTO via consulta, aplicada às mesmas RPCs/máquina de estados de sempre.
  const reconciliarId = await readReconciliarDocumentoId(req);
  if (reconciliarId) {
    return await handleReconciliar(supabase, reconciliarId, providerType, deployAmbiente, legacyProviderConfig, timeoutMs);
  }

  const { data: docs, error: claimErr } = await supabase.rpc("fiscal_claim_documentos", {
    p_limit: limit,
  });
  if (claimErr) {
    return json(500, { ok: false, error: `CLAIM_ERROR:${claimErr.message}` });
  }

  const processed: string[] = [];
  const counters: WorkerCounters = { emitted: [], failed: [], retried: [] };

  for (const raw of (docs ?? []) as Array<Record<string, unknown>>) {
    const doc: FiscalDoc = {
      id: String(raw.id),
      venda_id: String(raw.venda_id),
      tipo_doc: String(raw.tipo_doc),
      tentativas: typeof raw.tentativas === "number" ? raw.tentativas : 0,
      correlation_id: typeof raw.correlation_id === "string" ? raw.correlation_id : undefined,
      payload: raw.payload && isRecord(raw.payload) ? raw.payload : null,
    };
    processed.push(doc.id);

    // C2.1 — resolução de credencial multiempresa (só quando o worker está em
    // modo "focus"; mock/http/bling seguem 100% no mecanismo legado abaixo,
    // sem nenhuma mudança de comportamento).
    let cfg: ProviderConfig = legacyProviderConfig;
    if (providerType === "focus") {
      const lojaId = extractLojaId(doc.payload);
      const cred = await resolveFocusCredential(supabase, lojaId, deployAmbiente);
      if (!cred.ok) {
        // Fail closed: zero HTTP para este documento. Nunca loga o token —
        // só o código de erro (nome, não valor).
        await applyCredentialResolutionFailure(supabase, doc, cred.code, counters);
        continue;
      }
      cfg = { type: "focus", token: cred.token, url: resolveFocusBaseUrl(cred.ambiente), timeout: timeoutMs };
    }

    const provider = createFiscalProvider(cfg);

    // C2.7 — retry seguro: em qualquer tentativa que não seja a primeira,
    // consultar o estado remoto ANTES de reemitir. Só documentos NÃO
    // encontrados na Focus prosseguem para um novo POST. Extraído para
    // `enforceRetrySafeGate` (sprint de convergência) para ser provado por
    // teste executável, não só por inspeção — comportamento inalterado.
    const gate = await enforceRetrySafeGate(supabase, doc, provider, resolveFocusRef(doc), cfg, counters);
    if (!gate.proceed) continue;

    // C2.6 — NF-e: 3 estados possíveis (201 autorizado / 202 processando /
    // erro). Reaproveita EM_PROCESSAMENTO já existente para "processando" —
    // nenhuma RPC é chamada nesse caso (ver applyFocusRemoteState).
    if (doc.tipo_doc.trim().toUpperCase() === "NFE" && provider.emitirNfe) {
      const estado = await provider.emitirNfe(doc, cfg);
      await applyFocusRemoteState(supabase, doc, estado, counters);
      continue;
    }

    // Fluxo existente (NFC-e/STUB via callProvider — 2 estados; mock/http/
    // bling) — inalterado desde antes da C2.
    const result = await callProvider(doc, cfg);

    if (result.ok) {
      const { error } = await supabase.rpc("fiscal_marcar_emitido", {
        p_documento_id: doc.id,
        p_chave_fiscal: result.chave_fiscal,
        p_protocolo: result.protocolo,
        p_provider_ref: result.provider_ref ?? null,
        p_payload: result.payload ?? null,
      });
      if (error) {
        counters.failed.push({ id: doc.id, erro: `MARCAR_EMITIDO_ERROR:${error.message}` });
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
          counters.retried.push({
            id: doc.id,
            proxima_tentativa: row?.proxima_tentativa_em ?? null,
          });
        }
      } else {
        counters.emitted.push(doc.id);
      }
    } else if (result.transitorio) {
      const { error: retryErr } = await supabase.rpc("fiscal_marcar_erro", {
        p_documento_id: doc.id,
        p_erro: result.erro,
        p_transitorio: true,
      });
      if (retryErr) {
        counters.failed.push({ id: doc.id, erro: `MARCAR_ERRO:${retryErr.message}` });
      } else {
        const { data: row } = await supabase
          .from("documentos_fiscais_pendentes")
          .select("proxima_tentativa_em")
          .eq("id", doc.id)
          .maybeSingle();
        counters.retried.push({
          id: doc.id,
          proxima_tentativa: row?.proxima_tentativa_em ?? null,
        });
      }
    } else {
      counters.failed.push({ id: doc.id, erro: result.erro });
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
    claimed: (docs ?? []).length,
    processed,
    emitted: counters.emitted,
    failed: counters.failed,
    retried: counters.retried,
  });
});

// deno-lint-ignore no-explicit-any
async function readReconciliarDocumentoId(req: Request): Promise<string | null> {
  try {
    const clone = req.clone();
    const body = await clone.json().catch(() => null);
    if (isRecord(body) && body.mode === "reconciliar" && typeof body.documento_id === "string" && body.documento_id.trim() !== "") {
      return body.documento_id;
    }
  } catch {
    // corpo não é o de reconciliação — segue fluxo normal de claim/emissão.
  }
  return null;
}

/**
 * C2.8 — reconciliação explícita, por documento, sob demanda (chamada
 * separada do laço de claim/emissão). Fluxo: DocumentoFiscal local ->
 * referência -> FiscalProvider (consulta, nunca emite) -> resultado canônico
 * -> mesma RPC/máquina de estados já usada em todo o resto do worker -> mesma
 * auditoria automática (triggers de documentos_fiscais_eventos, já
 * existentes). Não agenda nada — é chamada explícita (painel/gerente, ou uma
 * automação externa a definir fora desta onda).
 */
async function handleReconciliar(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  documentoId: string,
  providerType: ProviderConfig["type"],
  deployAmbiente: "homologacao" | "producao" | null,
  legacyProviderConfig: ProviderConfig,
  timeoutMs: number,
): Promise<Response> {
  const { data: raw, error: fetchErr } = await supabase
    .from("documentos_fiscais_pendentes")
    .select("id, venda_id, tipo_doc, tentativas, correlation_id, payload, status")
    .eq("id", documentoId)
    .maybeSingle();
  if (fetchErr || !raw) {
    return json(404, { ok: false, error: "DOCUMENTO_NAO_ENCONTRADO" });
  }

  const doc: FiscalDoc = {
    id: String(raw.id),
    venda_id: String(raw.venda_id),
    tipo_doc: String(raw.tipo_doc),
    tentativas: typeof raw.tentativas === "number" ? raw.tentativas : 0,
    correlation_id: typeof raw.correlation_id === "string" ? raw.correlation_id : undefined,
    payload: raw.payload && isRecord(raw.payload) ? raw.payload : null,
  };

  let cfg: ProviderConfig = legacyProviderConfig;
  if (providerType === "focus") {
    const lojaId = extractLojaId(doc.payload);
    const cred = await resolveFocusCredential(supabase, lojaId, deployAmbiente);
    if (!cred.ok) {
      const counters: WorkerCounters = { emitted: [], failed: [], retried: [] };
      await applyCredentialResolutionFailure(supabase, doc, cred.code, counters);
      return json(200, { ok: true, documento_id: doc.id, resultado: "erro_credencial", detalhe: cred.code });
    }
    cfg = { type: "focus", token: cred.token, url: resolveFocusBaseUrl(cred.ambiente), timeout: timeoutMs };
  }

  const provider = createFiscalProvider(cfg);
  if (!provider.consultarDocumento) {
    return json(400, { ok: false, error: "PROVIDER_SEM_CONSULTA" });
  }

  const ref = resolveFocusRef(doc);
  const estado = await provider.consultarDocumento(ref, doc.tipo_doc, cfg);
  const counters: WorkerCounters = { emitted: [], failed: [], retried: [] };
  await applyFocusRemoteState(supabase, doc, estado, counters);

  return json(200, { ok: true, documento_id: doc.id, resultado: estado.kind });
}
