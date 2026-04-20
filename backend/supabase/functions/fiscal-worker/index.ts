import { createClient } from "@supabase/supabase-js";
import { timingSafeEqualSecret } from "../_shared/crypto.ts";

type FiscalDoc = {
  id: string;
  venda_id: string;
  tipo_doc: string;
  payload: Record<string, unknown> | null;
};

type ProviderResult =
  | {
    ok: true;
    chave_fiscal: string;
    protocolo: string;
    provider_ref?: string | null;
    payload?: Record<string, unknown> | null;
  }
  | { ok: false; erro: string; transitorio: boolean };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function randomHex(bytes = 12): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function processWithMockProvider(doc: FiscalDoc): Promise<ProviderResult> {
  const chave = `NFE-MOCK-${doc.venda_id.slice(0, 8)}-${randomHex(4)}`;
  const protocolo = `PROTO-${randomHex(6)}`;
  return {
    ok: true,
    chave_fiscal: chave,
    protocolo,
    provider_ref: `mock:${doc.id}`,
    payload: { mocked: true, emitted_at: new Date().toISOString() },
  };
}

async function processWithHttpProvider(
  doc: FiscalDoc,
  providerUrl: string,
  providerToken: string | null,
  timeoutMs: number,
): Promise<ProviderResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(providerToken ? { Authorization: `Bearer ${providerToken}` } : {}),
      },
      body: JSON.stringify({
        documento_id: doc.id,
        venda_id: doc.venda_id,
        tipo_doc: doc.tipo_doc,
        payload: doc.payload ?? {},
      }),
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignora JSON inválido e usa fallback abaixo
    }
    const record = isRecord(body) ? body : {};
    if (!res.ok) {
      return {
        ok: false,
        erro: String(record.error ?? `HTTP_${res.status}`),
        transitorio: res.status >= 500 || res.status === 429,
      };
    }
    const chave = typeof record.chave_fiscal === "string" ? record.chave_fiscal : "";
    const protocolo = typeof record.protocolo === "string" ? record.protocolo : "";
    if (!chave || !protocolo) {
      return { ok: false, erro: "PROVIDER_INVALID_RESPONSE", transitorio: false };
    }
    return {
      ok: true,
      chave_fiscal: chave,
      protocolo,
      provider_ref: typeof record.provider_ref === "string" ? record.provider_ref : null,
      payload: record,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: `HTTP_PROVIDER_ERROR:${msg}`, transitorio: true };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const workerKey = Deno.env.get("FISCAL_WORKER_KEY");
  const gotKey = req.headers.get("X-FISCAL-WORKER-KEY");
  if (!workerKey?.trim() || !gotKey?.trim() || !(await timingSafeEqualSecret(workerKey, gotKey))) {
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

  const providerMode = (Deno.env.get("FISCAL_PROVIDER_MODE") ?? "mock").toLowerCase();
  const providerUrl = Deno.env.get("FISCAL_PROVIDER_URL") ?? "";
  const providerToken = Deno.env.get("FISCAL_PROVIDER_TOKEN") ?? null;
  const timeoutMsRaw = Number(Deno.env.get("FISCAL_PROVIDER_TIMEOUT_MS") ?? "10000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
    ? Math.floor(timeoutMsRaw)
    : 10000;

  if (providerMode !== "mock" && providerMode !== "http") {
    return json(500, { ok: false, error: "INVALID_PROVIDER_MODE" });
  }
  if (providerMode === "http" && !providerUrl.trim()) {
    return json(500, { ok: false, error: "MISSING_PROVIDER_URL" });
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

  for (const raw of (docs ?? []) as FiscalDoc[]) {
    const doc: FiscalDoc = {
      id: String(raw.id),
      venda_id: String(raw.venda_id),
      tipo_doc: String(raw.tipo_doc),
      payload: raw.payload && isRecord(raw.payload) ? raw.payload : null,
    };
    processed.push(doc.id);

    const result = providerMode === "http"
      ? await processWithHttpProvider(doc, providerUrl, providerToken, timeoutMs)
      : await processWithMockProvider(doc);

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
        await supabase.rpc("fiscal_marcar_erro", {
          p_documento_id: doc.id,
          p_erro: `MARCAR_EMITIDO_ERROR:${error.message}`,
          p_transitorio: true,
        });
      } else {
        emitted.push(doc.id);
      }
    } else {
      failed.push({ id: doc.id, erro: result.erro });
      await supabase.rpc("fiscal_marcar_erro", {
        p_documento_id: doc.id,
        p_erro: result.erro,
        p_transitorio: result.transitorio,
      });
    }
  }

  return json(200, {
    ok: true,
    provider_mode: providerMode,
    claimed: (docs ?? []).length,
    processed,
    emitted,
    failed,
  });
});
