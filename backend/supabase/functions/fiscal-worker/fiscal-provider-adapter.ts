import type { FiscalDoc, ProviderResult } from "./fiscal_types.ts";
import { asString, isRecord, randomHex } from "./fiscal_http.ts";

function encodeFocusBasicAuth(token: string): string {
  const t = token.trim();
  return btoa(`${t}:`);
}

function buildFocusRequestUrl(baseUrl: string, ref: string): string {
  const b = baseUrl.trim();
  if (b.includes("{ref}")) return b.split("{ref}").join(encodeURIComponent(ref));
  const joiner = b.includes("?") ? "&" : "?";
  return `${b}${joiner}ref=${encodeURIComponent(ref)}`;
}

function pickFocusChaveProtocolo(record: Record<string, unknown>): { chave: string; protocolo: string } {
  const nested = isRecord(record["nfe"])
    ? (record["nfe"] as Record<string, unknown>)
    : isRecord(record["nfce"])
    ? (record["nfce"] as Record<string, unknown>)
    : null;
  const pools: Array<Record<string, unknown>> = [record];
  if (nested) pools.push(nested);

  let chave = "";
  let protocolo = "";
  const chaveKeys = ["chave_nfe", "chave_acesso", "chave_de_acesso", "chave", "chave_sefaz"] as const;
  const protoKeys = [
    "protocolo_autorizacao",
    "protocolo_nfe",
    "protocolo",
    "numero_protocolo",
    "nProt",
  ] as const;

  for (const pool of pools) {
    if (!chave) {
      for (const k of chaveKeys) {
        const v = asString(pool[k]);
        if (v) {
          chave = v;
          break;
        }
      }
    }
    if (!protocolo) {
      for (const k of protoKeys) {
        const v = asString(pool[k]);
        if (v) {
          protocolo = v;
          break;
        }
      }
    }
  }

  return { chave, protocolo };
}

function httpStatusIsTransient(status: number): boolean {
  if (status >= 500) return true;
  return status === 408 || status === 429 || status === 425 || status === 503 || status === 504;
}

// Configuração do provider
export interface ProviderConfig {
  type: 'mock' | 'http' | 'focus' | 'bling';
  url?: string;
  token?: string;
  timeout?: number;
}

// Interface abstrata do provider
export interface FiscalProvider {
  callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult>;
}

// Mock Provider - mantém comportamento existente
export class MockProvider implements FiscalProvider {
  async callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
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
}

// HTTP Provider - generaliza lógica HTTP existente
export class HttpProvider implements FiscalProvider {
  async callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
    const { url, token, timeout = 10000 } = config;
    
    if (!url) {
      return {
        ok: false,
        erro: "MISSING_PROVIDER_URL",
        transitorio: false,
        provider_code: "MISSING_PROVIDER_URL",
        provider_message: "URL do provider não configurada",
      };
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
          transitorio: httpStatusIsTransient(res.status),
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
        erro: isAbort ? "HTTP_PROVIDER_TIMEOUT" : "HTTP_PROVIDER_ERROR",
        transitorio: true,
        provider_code: isAbort ? "HTTP_PROVIDER_TIMEOUT" : "HTTP_PROVIDER_ERROR",
        provider_message: msg,
      };
    } finally {
      clearTimeout(t);
    }
  }
}

/**
 * Focus NFe: HTTP Basic com token (usuário = token, senha vazia), conforme documentação Focus.
 * `config.url` deve apontar para o endpoint desejado (ex.: .../v2/nfe); use `{ref}` no path ou
 * query `ref=` será acrescentada. Corpo JSON inclui envelope FastProduct até mapearmos o DTO Focus.
 */
export class FocusProvider implements FiscalProvider {
  async callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
    const { url, token, timeout = 30_000 } = config;

    if (!url?.trim() || !token?.trim()) {
      return {
        ok: false,
        erro: "FOCUS_MISSING_URL_OR_TOKEN",
        transitorio: false,
        provider_code: "FOCUS_MISSING_URL_OR_TOKEN",
        provider_message: "Defina FISCAL_PROVIDER_URL (endpoint Focus) e FISCAL_PROVIDER_TOKEN.",
      };
    }

    const refField = (Deno.env.get("FISCAL_FOCUS_REF_FIELD") ?? "documento_id").toLowerCase();
    const ref = refField === "venda_id" ? doc.venda_id : doc.id;
    const requestUrl = buildFocusRequestUrl(url, ref);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${encodeFocusBasicAuth(token)}`,
        },
        body: JSON.stringify({
          ref,
          documento_id: doc.id,
          venda_id: doc.venda_id,
          tipo_doc: doc.tipo_doc,
          correlation_id: doc.correlation_id ?? null,
          payload: doc.payload ?? {},
        }),
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // corpo não JSON
      }

      const record = isRecord(body) ? body : {};

      if (!res.ok) {
        const errorCode = asString(record.codigo) ??
          asString(record.status) ??
          asString(record.error) ??
          `HTTP_${res.status}`;
        const providerMessage = asString(record.mensagem) ??
          asString(record.message) ??
          asString(record.error_description);

        return {
          ok: false,
          erro: errorCode,
          transitorio: httpStatusIsTransient(res.status),
          http_status: res.status,
          provider_code: errorCode,
          provider_message: providerMessage,
          payload: record,
        };
      }

      const { chave, protocolo } = pickFocusChaveProtocolo(record);
      if (!chave || !protocolo) {
        return {
          ok: false,
          erro: "FOCUS_INVALID_RESPONSE",
          transitorio: false,
          http_status: res.status,
          provider_code: "FOCUS_INVALID_RESPONSE",
          provider_message: "Resposta sem chave/protocolo reconhecíveis.",
          payload: record,
        };
      }

      const providerRef = asString(record.ref) ?? asString(record.referencia) ?? ref;

      return {
        ok: true,
        chave_fiscal: chave,
        protocolo,
        provider_ref: providerRef,
        payload: record,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      const msg = e instanceof Error ? e.message : String(e);

      return {
        ok: false,
        erro: isAbort ? "FOCUS_PROVIDER_TIMEOUT" : "FOCUS_PROVIDER_ERROR",
        transitorio: true,
        provider_code: isAbort ? "FOCUS_PROVIDER_TIMEOUT" : "FOCUS_PROVIDER_ERROR",
        provider_message: msg,
      };
    } finally {
      clearTimeout(t);
    }
  }
}

// Bling Provider - placeholder para implementação futura
export class BlingProvider implements FiscalProvider {
  async callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
    // TODO: Implementar integração específica com Bling
    // Por enquanto, usa HTTP provider com configuração específica
    const httpProvider = new HttpProvider();
    return httpProvider.callProvider(doc, config);
  }
}

// Factory para criar provider baseado na configuração
export function createFiscalProvider(config: ProviderConfig): FiscalProvider {
  switch (config.type) {
    case 'mock':
      return new MockProvider();
    case 'http':
      return new HttpProvider();
    case 'focus':
      return new FocusProvider();
    case 'bling':
      return new BlingProvider();
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
}

// Função principal que substitui a lógica direta
export async function callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
  const provider = createFiscalProvider(config);
  const result = await provider.callProvider(doc, config);
  
  // Validação básica do resultado
  if (result.ok) {
    if (!result.chave_fiscal || !result.protocolo) {
      return {
        ok: false,
        erro: "INVALID_PROVIDER_RESPONSE",
        transitorio: false,
        provider_code: "INVALID_PROVIDER_RESPONSE",
        provider_message: "Resposta do provider não contém chave_fiscal ou protocolo",
        payload: result.payload,
      };
    }
  }
  
  return result;
}
