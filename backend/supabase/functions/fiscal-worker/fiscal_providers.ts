import type { FiscalDoc, ProviderResult } from "./fiscal_types.ts";
import { asString, isRecord, randomHex } from "./fiscal_http.ts";

export async function processWithMockProvider(doc: FiscalDoc): Promise<ProviderResult> {
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

export async function processWithHttpProvider(
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
      const errorCode = asString(record.error) ??
        asString(record.code) ??
        asString(record.sefaz_code) ??
        `HTTP_${res.status}`;
      const providerMessage = asString(record.message) ??
        asString(record.error_description) ??
        asString(record.sefaz_message);
      return {
        ok: false,
        erro: errorCode,
        transitorio: res.status >= 500 || res.status === 429 || res.status === 408 || res.status === 504,
        http_status: res.status,
        provider_code: errorCode,
        provider_message: providerMessage,
        payload: record,
      };
    }
    const chave = typeof record.chave_fiscal === "string" ? record.chave_fiscal : "";
    const protocolo = typeof record.protocolo === "string" ? record.protocolo : "";
    if (!chave || !protocolo) {
      return {
        ok: false,
        erro: "PROVIDER_INVALID_RESPONSE",
        transitorio: false,
        http_status: res.status,
        provider_code: "PROVIDER_INVALID_RESPONSE",
        payload: record,
      };
    }
    return {
      ok: true,
      chave_fiscal: chave,
      protocolo,
      provider_ref: typeof record.provider_ref === "string" ? record.provider_ref : null,
      payload: record,
    };
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      erro: isAbort ? "HTTP_PROVIDER_TIMEOUT" : `HTTP_PROVIDER_ERROR:${msg}`,
      transitorio: true,
      provider_code: isAbort ? "HTTP_PROVIDER_TIMEOUT" : "HTTP_PROVIDER_ERROR",
      provider_message: msg,
    };
  } finally {
    clearTimeout(t);
  }
}
