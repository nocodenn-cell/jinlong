import type { FiscalDoc, FocusRemoteState, ProviderResult } from "./fiscal_types.ts";
import { asString, isRecord, randomHex } from "./fiscal_http.ts";
import { buildFocusNfceEnvelope } from "./fiscal_focus_dto.ts";

function encodeFocusBasicAuth(token: string): string {
  const t = token.trim();
  return btoa(`${t}:`);
}

// Onda C2.4/C2.6 (prontidão Focus NFe) — endpoints confirmados pela documentação
// oficial da Focus: POST/GET /v2/nfce e POST/GET /v2/nfe. `config.url` agora é
// só a URL BASE (ex.: https://homologacao.focusnfe.com.br) — quem resolve qual
// base usar por ambiente é `resolveFocusBaseUrl` (fiscal_credential_resolver.ts),
// nunca o payload/domínio. O path completo é decidido aqui a partir de
// `doc.tipo_doc`, nunca de uma URL pré-configurada de ponta a ponta (o
// mecanismo antigo, com placeholder `{ref}` em `FISCAL_PROVIDER_URL`, nunca foi
// usado em produção — confirmado na Fase A — então trocar por algo mais correto
// não é uma mudança que quebra nada real).
function focusEndpointPath(tipoDoc: string): "/v2/nfce" | "/v2/nfe" {
  return tipoDoc.trim().toUpperCase() === "NFE" ? "/v2/nfe" : "/v2/nfce";
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildFocusEmitUrl(baseUrl: string, tipoDoc: string, ref: string): string {
  return `${stripTrailingSlash(baseUrl)}${focusEndpointPath(tipoDoc)}?ref=${encodeURIComponent(ref)}`;
}

function buildFocusConsultaUrl(baseUrl: string, tipoDoc: string, ref: string): string {
  return `${stripTrailingSlash(baseUrl)}${focusEndpointPath(tipoDoc)}/${encodeURIComponent(ref)}`;
}

/** Heurística tolerante herdada (pré-C2) — não reescrita nesta onda. Ver nota em
 * `fiscal_types.ts` sobre schema de resposta Focus não confirmado. */
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

function extractErrorCodeMessage(record: Record<string, unknown>): { code: string | null; message: string | null } {
  return {
    code: asString(record.codigo) ?? asString(record.status) ?? asString(record.error) ?? asString(record.code),
    message: asString(record.mensagem) ?? asString(record.message) ?? asString(record.error_description),
  };
}

/**
 * Onda C2.9 — classifica a resposta HTTP de uma chamada de EMISSÃO (POST) em um
 * `FocusRemoteState` canônico. Reaproveitada por `emitirNfce`/`emitirNfe` — única
 * fonte de verdade para "o que uma resposta de emissão significa".
 */
function classifyFocusEmitResponse(res: Response, record: Record<string, unknown>): FocusRemoteState {
  if (res.status === 202) {
    return { kind: "processando", payload: record };
  }

  if (!res.ok) {
    const { code, message } = extractErrorCodeMessage(record);
    const errorCode = code ?? `HTTP_${res.status}`;
    const kind = httpStatusIsTransient(res.status) ? "erro_transitorio" as const : "erro_definitivo" as const;
    return { kind, erro: errorCode, http_status: res.status, provider_code: errorCode, provider_message: message, payload: record };
  }

  const { chave, protocolo } = pickFocusChaveProtocolo(record);
  if (chave && protocolo) {
    const providerRef = asString(record.ref) ?? asString(record.referencia) ?? null;
    return { kind: "autorizado", chave_fiscal: chave, protocolo, provider_ref: providerRef, payload: record };
  }

  // 2xx sem chave/protocolo reconhecível: tratado como rejeição, não como
  // sucesso nem como falha de transporte. Heurística provisória — ver nota em
  // fiscal_types.ts (schema exato de rejeição Focus não confirmado).
  const { code, message } = extractErrorCodeMessage(record);
  return {
    kind: "rejeitado",
    erro: code ?? "FOCUS_REJEITADO_SEM_CODIGO",
    provider_code: code,
    provider_message: message,
    payload: record,
  };
}

/**
 * Onda C2.5/C2.8 — classifica a resposta HTTP de uma CONSULTA (GET). Ambíguo
 * (2xx sem chave/protocolo) vira `processando`, não `rejeitado`: uma consulta
 * existe justamente para resolver incerteza, então o lado seguro de um caso
 * ambíguo é "ainda não sei", não "presumir rejeitado".
 */
function classifyFocusConsultaResponse(res: Response, record: Record<string, unknown>): FocusRemoteState {
  if (res.status === 404) return { kind: "nao_encontrado" };

  if (!res.ok) {
    const { code, message } = extractErrorCodeMessage(record);
    const errorCode = code ?? `HTTP_${res.status}`;
    const kind = httpStatusIsTransient(res.status) ? "erro_transitorio" as const : "erro_definitivo" as const;
    return { kind, erro: errorCode, http_status: res.status, provider_code: errorCode, provider_message: message, payload: record };
  }

  const { chave, protocolo } = pickFocusChaveProtocolo(record);
  if (chave && protocolo) {
    const providerRef = asString(record.ref) ?? asString(record.referencia) ?? null;
    return { kind: "autorizado", chave_fiscal: chave, protocolo, provider_ref: providerRef, payload: record };
  }

  return { kind: "processando", payload: record };
}

function focusStateToProviderResult(state: FocusRemoteState): ProviderResult {
  switch (state.kind) {
    case "autorizado":
      return { ok: true, chave_fiscal: state.chave_fiscal, protocolo: state.protocolo, provider_ref: state.provider_ref, payload: state.payload };
    case "rejeitado":
      return {
        ok: false,
        erro: state.erro,
        transitorio: false,
        provider_code: state.provider_code,
        provider_message: state.provider_message,
        payload: state.payload,
      };
    case "erro_definitivo":
      return {
        ok: false,
        erro: state.erro,
        transitorio: false,
        http_status: state.http_status,
        provider_code: state.provider_code,
        provider_message: state.provider_message,
        payload: state.payload,
      };
    case "erro_transitorio":
      return {
        ok: false,
        erro: state.erro,
        transitorio: true,
        http_status: state.http_status,
        provider_code: state.provider_code,
        provider_message: state.provider_message,
        payload: state.payload,
      };
    case "processando":
      // NFC-e é sempre síncrona (contrato confirmado) — 202 aqui é inesperado.
      // Tratado como erro definitivo explícito em vez de mascarado como sucesso/retry.
      return {
        ok: false,
        erro: "FOCUS_NFCE_202_INESPERADO",
        transitorio: false,
        provider_code: "FOCUS_NFCE_202_INESPERADO",
        provider_message: "NFC-e deveria ser síncrona; Focus retornou 202 para um doc NFC-e.",
        payload: state.payload,
      };
    case "nao_encontrado":
      return { ok: false, erro: "FOCUS_NAO_ENCONTRADO", transitorio: false, provider_code: "FOCUS_NAO_ENCONTRADO", provider_message: null, payload: null };
  }
}

// Configuração do provider
export interface ProviderConfig {
  type: 'mock' | 'http' | 'focus' | 'bling';
  url?: string;
  token?: string;
  timeout?: number;
}

// Interface abstrata do provider. `emitirNfe`/`consultarDocumento` são opcionais
// (Onda C2.8: "capacidade explícita no port existente, menor alteração
// possível") — só FocusProvider os implementa; Mock/Http/Bling seguem só com
// `callProvider`, sem nenhuma mudança de contrato para eles.
export interface FiscalProvider {
  callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult>;
  emitirNfe?(doc: FiscalDoc, config: ProviderConfig): Promise<FocusRemoteState>;
  consultarDocumento?(ref: string, tipoDoc: string, config: ProviderConfig): Promise<FocusRemoteState>;
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

/**
 * Focus NFe: HTTP Basic com token (usuário = token, senha vazia), conforme
 * documentação oficial (confirmada nesta missão). `config.url` é a URL BASE do
 * ambiente (resolvida por `resolveFocusBaseUrl`, nunca escolhida pelo
 * payload/domínio); o path (`/v2/nfce` ou `/v2/nfe`) é decidido por
 * `doc.tipo_doc`. `ref` = identificador estável do DocumentoFiscal (já usado
 * desde antes da C2 — nunca regenerado entre tentativas).
 *
 * DTO: só os campos confirmados pela documentação (`cnpj_emitente`,
 * `data_emissao`) são mapeados de verdade — ver fiscal_focus_dto.ts para os
 * gaps estruturais (items[]/formas_pagamento[]/natureza_operacao/etc., não
 * inventados). O corpo enviado inclui esses campos confirmados + o envelope de
 * rastreio (ref/documento_id/venda_id/tipo_doc/correlation_id) já existente
 * antes da C2 — item/pagamento NÃO são inventados com nomes de campo Focus.
 */
/** Mesma referência estável usada desde antes da C2 — nunca regenerada entre
 * tentativas. Exportada para que o worker (index.ts) use exatamente a mesma
 * lógica ao montar a consulta de retry-seguro (C2.7). */
export function resolveFocusRef(doc: FiscalDoc): string {
  const refField = (Deno.env.get("FISCAL_FOCUS_REF_FIELD") ?? "documento_id").toLowerCase();
  return refField === "venda_id" ? doc.venda_id : doc.id;
}

export class FocusProvider implements FiscalProvider {
  private resolveRef(doc: FiscalDoc): string {
    return resolveFocusRef(doc);
  }

  private buildEmitBody(doc: FiscalDoc, ref: string): Record<string, unknown> {
    const { body: known, gaps } = buildFocusNfceEnvelope(doc.payload);
    return {
      ...known,
      ref,
      documento_id: doc.id,
      venda_id: doc.venda_id,
      tipo_doc: doc.tipo_doc,
      correlation_id: doc.correlation_id ?? null,
      // Diagnóstico interno — nunca confundir com dado que a Focus espera.
      // Ajuda a rastrear, num payload de teste/homologação, quais campos
      // ainda não têm mapeamento confirmado (ver fiscal_focus_dto.ts).
      _fastproduct_dto_gaps: gaps.map((g) => g.campo),
    };
  }

  private async postEmit(url: string, token: string, body: Record<string, unknown>, timeout: number): Promise<FocusRemoteState> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${encodeFocusBasicAuth(token)}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // corpo não JSON
      }
      const record = isRecord(parsed) ? parsed : {};
      return classifyFocusEmitResponse(res, record);
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      const msg = e instanceof Error ? e.message : String(e);
      return {
        kind: "erro_transitorio",
        erro: isAbort ? "FOCUS_PROVIDER_TIMEOUT" : `FOCUS_PROVIDER_ERROR:${msg}`,
        http_status: null,
        provider_code: isAbort ? "FOCUS_PROVIDER_TIMEOUT" : "FOCUS_PROVIDER_ERROR",
        provider_message: msg,
        payload: null,
      };
    } finally {
      clearTimeout(t);
    }
  }

  /** C2.4 — emissão NFC-e (sempre síncrona). Mantém o contrato `ProviderResult`
   * já usado pelo restante do worker (fiscal_marcar_emitido/fiscal_marcar_erro),
   * sem exigir mudança no chamador existente. */
  async callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
    const { url, token, timeout = 30_000 } = config;

    if (!url?.trim() || !token?.trim()) {
      return {
        ok: false,
        erro: "FOCUS_MISSING_URL_OR_TOKEN",
        transitorio: false,
        provider_code: "FOCUS_MISSING_URL_OR_TOKEN",
        provider_message: "Config do provider sem URL base ou token resolvido.",
      };
    }

    const ref = this.resolveRef(doc);
    const requestUrl = buildFocusEmitUrl(url, doc.tipo_doc, ref);
    const body = this.buildEmitBody(doc, ref);
    const state = await this.postEmit(requestUrl, token, body, timeout);
    return focusStateToProviderResult(state);
  }

  /** C2.6 — emissão NF-e (201 autorizada ou 202 processando; 202 NÃO é erro —
   * ver classifyFocusEmitResponse). Retorna o estado canônico direto: o
   * chamador decide o que fazer com "processando" (nada — o documento já está
   * EM_PROCESSAMENTO desde o claim; reconciliação resolve depois). */
  async emitirNfe(doc: FiscalDoc, config: ProviderConfig): Promise<FocusRemoteState> {
    const { url, token, timeout = 30_000 } = config;
    if (!url?.trim() || !token?.trim()) {
      return {
        kind: "erro_definitivo",
        erro: "FOCUS_MISSING_URL_OR_TOKEN",
        http_status: null,
        provider_code: "FOCUS_MISSING_URL_OR_TOKEN",
        provider_message: "Config do provider sem URL base ou token resolvido.",
        payload: null,
      };
    }
    const ref = this.resolveRef(doc);
    const requestUrl = buildFocusEmitUrl(url, doc.tipo_doc, ref);
    const body = this.buildEmitBody(doc, ref);
    return await this.postEmit(requestUrl, token, body, timeout);
  }

  /** C2.5/C2.8 — consulta por referência (GET). Nunca emite; só lê. Usada tanto
   * para resolver NF-e 202 quanto para reconciliação/retry-seguro de qualquer
   * tipo de documento. */
  async consultarDocumento(ref: string, tipoDoc: string, config: ProviderConfig): Promise<FocusRemoteState> {
    const { url, token, timeout = 30_000 } = config;
    if (!url?.trim() || !token?.trim()) {
      return {
        kind: "erro_definitivo",
        erro: "FOCUS_MISSING_URL_OR_TOKEN",
        http_status: null,
        provider_code: "FOCUS_MISSING_URL_OR_TOKEN",
        provider_message: "Config do provider sem URL base ou token resolvido.",
        payload: null,
      };
    }

    const requestUrl = buildFocusConsultaUrl(url, tipoDoc, ref);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${encodeFocusBasicAuth(token)}`,
        },
        signal: controller.signal,
      });

      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // corpo não JSON
      }
      const record = isRecord(parsed) ? parsed : {};
      return classifyFocusConsultaResponse(res, record);
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      const msg = e instanceof Error ? e.message : String(e);
      return {
        kind: "erro_transitorio",
        erro: isAbort ? "FOCUS_PROVIDER_TIMEOUT" : `FOCUS_PROVIDER_ERROR:${msg}`,
        http_status: null,
        provider_code: isAbort ? "FOCUS_PROVIDER_TIMEOUT" : "FOCUS_PROVIDER_ERROR",
        provider_message: msg,
        payload: null,
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
