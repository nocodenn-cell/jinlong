import type { FiscalDoc, ProviderResult } from "./fiscal_types.ts";
import { asString, isRecord, randomHex } from "./fiscal_http.ts";

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

// Schema Zod para validação do retorno (importado dinamicamente para evitar dependências)
const ProviderResultSchema = {
  ok: true,
  chave_fiscal: "",
  protocolo: "",
  provider_ref: null as string | null,
  payload: null as Record<string, unknown> | null,
};

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
}

// Focus Provider - placeholder para implementação futura
export class FocusProvider implements FiscalProvider {
  async callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
    // TODO: Implementar integração específica com Focus
    // Por enquanto, usa HTTP provider com configuração específica
    const httpProvider = new HttpProvider();
    return httpProvider.callProvider(doc, config);
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
