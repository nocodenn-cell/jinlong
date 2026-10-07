import type { FiscalDoc, FiscalXmlResult, FocusArtefatosRefs, FocusRemoteState, ProviderResult } from "./fiscal_types.ts";
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

/** Exportada (Sprint C2.9/P0-8) para teste direto de shape de URL. */
export function buildFocusEmitUrl(baseUrl: string, tipoDoc: string, ref: string): string {
  return `${stripTrailingSlash(baseUrl)}${focusEndpointPath(tipoDoc)}?ref=${encodeURIComponent(ref)}`;
}

/** Exportada (Sprint C2.9/P0-8) para teste direto de shape de URL. */
export function buildFocusConsultaUrl(baseUrl: string, tipoDoc: string, ref: string): string {
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
 * Sprint P0 Focus — referências devolvidas pela Focus na autorização
 * (contrato confirmado pela Focus em 2026-10-03). Guardadas como vieram,
 * sem compor host/path.
 */
export function extractFocusArtefatos(record: Record<string, unknown>): FocusArtefatosRefs {
  return {
    xml_path: asString(record.caminho_xml_nota_fiscal),
    danfe_path: asString(record.caminho_danfe),
    qrcode_url: asString(record.qrcode_url),
  };
}

/** `already_processed`: a referência já foi usada numa emissão anterior. */
export function isFocusAlreadyProcessed(record: Record<string, unknown>): boolean {
  return asString(record.codigo)?.toLowerCase() === "already_processed";
}

/**
 * Sprint P0 Focus — classificação pelo campo `status` do corpo, que é a fonte
 * de verdade quando presente. Valores tratados (contrato Focus):
 * `autorizado`, `processando_autorizacao`, `erro_autorizacao`, `cancelado`,
 * `denegado`. Devolve `null` quando o corpo não traz `status` reconhecível —
 * o chamador cai na classificação por HTTP já existente.
 *
 *   - `cancelado` NUNCA vira `autorizado`, mesmo que o corpo ainda traga a
 *     chave/protocolo da autorização original.
 *   - `denegado` é terminal e nunca vira `autorizado`.
 *   - `autorizado` sem chave/protocolo não é aceito como EMITIDO: vira erro
 *     transitório (a próxima tentativa consulta antes de qualquer POST).
 *   - `status` presente mas desconhecido: erro transitório explícito (nunca
 *     presumido sucesso nem rejeição).
 */
export function classifyByFocusStatus(record: Record<string, unknown>): FocusRemoteState | null {
  const status = asString(record.status)?.toLowerCase();
  if (!status) return null;
  const { code, message } = extractErrorCodeMessage(record);
  switch (status) {
    case "autorizado": {
      const { chave, protocolo } = pickFocusChaveProtocolo(record);
      if (!chave || !protocolo) {
        return {
          kind: "erro_transitorio",
          erro: "FOCUS_AUTORIZADO_SEM_CHAVE_PROTOCOLO",
          http_status: null,
          provider_code: "FOCUS_AUTORIZADO_SEM_CHAVE_PROTOCOLO",
          provider_message: "Focus devolveu status=autorizado sem chave/protocolo reconhecíveis.",
          payload: record,
        };
      }
      const providerRef = asString(record.ref) ?? asString(record.referencia) ?? null;
      return { kind: "autorizado", chave_fiscal: chave, protocolo, provider_ref: providerRef, artefatos: extractFocusArtefatos(record), payload: record };
    }
    case "processando_autorizacao":
      return { kind: "processando", payload: record };
    case "erro_autorizacao":
      return {
        kind: "rejeitado",
        erro: "FOCUS_ERRO_AUTORIZACAO",
        provider_code: code && code !== status ? code : "FOCUS_ERRO_AUTORIZACAO",
        provider_message: message,
        payload: record,
      };
    case "cancelado":
      return {
        kind: "cancelado",
        protocolo_cancelamento: asString(record.numero_protocolo),
        xml_cancelamento_path: asString(record.caminho_xml_cancelamento),
        payload: record,
      };
    case "denegado":
      return {
        kind: "denegado",
        erro: "FOCUS_DENEGADO",
        provider_code: code && code !== status ? code : "FOCUS_DENEGADO",
        provider_message: message,
        payload: record,
      };
    default:
      return {
        kind: "erro_transitorio",
        erro: `FOCUS_STATUS_DESCONHECIDO:${status}`,
        http_status: null,
        provider_code: "FOCUS_STATUS_DESCONHECIDO",
        provider_message: `status='${status}' não faz parte do contrato tratado.`,
        payload: record,
      };
  }
}

/**
 * Onda C2.9 — classifica a resposta HTTP de uma chamada de EMISSÃO (POST) em um
 * `FocusRemoteState` canônico. Reaproveitada por `emitirNfce`/`emitirNfe` — única
 * fonte de verdade para "o que uma resposta de emissão significa".
 */
/**
 * Sprint C2.9 (P0-8) — exportado para teste direto. A cobertura de
 * "resposta HTTP -> estado canônico" (status 2xx/4xx/5xx/timeout) não
 * precisa mais passar pelo `callProvider`/`emitirNfe` inteiros: desde o
 * fix de P0-3 (fail-closed no DTO), qualquer item real tem sempre o gap
 * incondicional de tributação (grupo ICMS-CST/PIS/COFINS ainda não
 * confirmado pela Focus), então `bloqueante` nunca é `false` para um
 * payload com itens — testar via `callProvider` bloquearia ANTES do POST,
 * o que é o comportamento correto, mas deixaria de exercitar o
 * classificador em si. Testar a função pura diretamente resolve os dois
 * sem inventar um DTO "completo" que não existe de verdade hoje.
 */
export function classifyFocusEmitResponse(res: Response, record: Record<string, unknown>): FocusRemoteState {
  // Sprint P0 Focus: `status` do corpo é a fonte da classificação quando
  // presente; `already_processed` resolve pela MESMA referência.
  if (isFocusAlreadyProcessed(record)) return { kind: "ja_processado", payload: record };
  const porStatus = classifyByFocusStatus(record);
  if (porStatus) return porStatus;

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
    return { kind: "autorizado", chave_fiscal: chave, protocolo, provider_ref: providerRef, artefatos: extractFocusArtefatos(record), payload: record };
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
export function classifyFocusConsultaResponse(res: Response, record: Record<string, unknown>): FocusRemoteState {
  if (res.status === 404) return { kind: "nao_encontrado" };
  const porStatus = classifyByFocusStatus(record);
  if (porStatus) return porStatus;

  if (!res.ok) {
    const { code, message } = extractErrorCodeMessage(record);
    const errorCode = code ?? `HTTP_${res.status}`;
    const kind = httpStatusIsTransient(res.status) ? "erro_transitorio" as const : "erro_definitivo" as const;
    return { kind, erro: errorCode, http_status: res.status, provider_code: errorCode, provider_message: message, payload: record };
  }

  const { chave, protocolo } = pickFocusChaveProtocolo(record);
  if (chave && protocolo) {
    const providerRef = asString(record.ref) ?? asString(record.referencia) ?? null;
    return { kind: "autorizado", chave_fiscal: chave, protocolo, provider_ref: providerRef, artefatos: extractFocusArtefatos(record), payload: record };
  }

  return { kind: "processando", payload: record };
}

function focusStateToProviderResult(state: FocusRemoteState): ProviderResult {
  switch (state.kind) {
    case "autorizado":
      return {
        ok: true,
        chave_fiscal: state.chave_fiscal,
        protocolo: state.protocolo,
        provider_ref: state.provider_ref,
        payload: state.payload,
        artefatos: state.artefatos,
      };
    case "cancelado":
      // Nunca `ok: true` — cancelado não é emissão autorizada.
      return {
        ok: false,
        erro: "FOCUS_DOCUMENTO_CANCELADO",
        transitorio: false,
        provider_code: "FOCUS_DOCUMENTO_CANCELADO",
        provider_message: "Focus informou status=cancelado.",
        payload: state.payload,
      };
    case "denegado":
      return {
        ok: false,
        erro: state.erro,
        transitorio: false,
        provider_code: state.provider_code,
        provider_message: state.provider_message,
        payload: state.payload,
      };
    case "ja_processado":
      // Transitório: a próxima tentativa passa pelo retry seguro, que
      // CONSULTA a mesma referência antes de qualquer POST.
      return {
        ok: false,
        erro: "FOCUS_ALREADY_PROCESSED",
        transitorio: true,
        provider_code: "already_processed",
        provider_message: "Referência já processada pela Focus — resolver por consulta.",
        payload: state.payload,
      };
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
      // `callProvider` só devolve 2 estados; "ainda processando" vira erro
      // transitório (a próxima tentativa consulta a mesma referência antes de
      // qualquer POST). O worker Focus usa `emitirDocumento`, que preserva o
      // estado `processando` sem passar por aqui.
      return {
        ok: false,
        erro: "FOCUS_PROCESSANDO_AUTORIZACAO",
        transitorio: true,
        provider_code: "FOCUS_PROCESSANDO_AUTORIZACAO",
        provider_message: "Focus ainda processando a autorização.",
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
  /** Sprint P0 Focus — emissão NFC-e ou NF-e devolvendo o estado canônico
   * completo (inclui `processando`, `cancelado`, `denegado`,
   * `ja_processado`), sem achatar em `ProviderResult`. */
  emitirDocumento?(doc: FiscalDoc, config: ProviderConfig): Promise<FocusRemoteState>;
  consultarDocumento?(ref: string, tipoDoc: string, config: ProviderConfig): Promise<FocusRemoteState>;
  /** Sprint P0 Focus — pedido de cancelamento (DELETE pela mesma referência,
   * corpo `{ justificativa }`). */
  cancelarDocumento?(ref: string, tipoDoc: string, justificativa: string, config: ProviderConfig): Promise<FocusRemoteState>;
  /** Sprint P0 Focus — XML de cancelamento a partir do
   * `caminho_xml_cancelamento` devolvido pela Focus. GET-only. */
  obterXmlCancelamento?(caminho: string | null, ref: string, tipoDoc: string, config: ProviderConfig): Promise<FiscalXmlResult>;
  /**
   * Missão final (C3) — obtém o XML autorizado de um documento já EMITIDO.
   * Contrato GET-only: nenhuma implementação pode chamar
   * `postFocusEmit`/`buildFocusEmitUrl` ou qualquer outro caminho de POST —
   * é usado por um passo de recovery completamente desacoplado da emissão
   * (nunca reabre/reemite nada). Opcional (mesmo padrão de `emitirNfe`/
   * `consultarDocumento`) — só implementado onde fizer sentido.
   */
  obterXmlAutorizado?(ref: string, tipoDoc: string, config: ProviderConfig, caminho?: string | null): Promise<FiscalXmlResult>;
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

  /** Só para exercitar a infraestrutura de armazenamento/idempotência de
   * XML nos testes (`fiscal_xml_orchestration.test.ts`) — não representa
   * nenhum contrato real (mock não fala com nenhuma SEFAZ). */
  async obterXmlAutorizado(ref: string, tipoDoc: string, _config: ProviderConfig, _caminho?: string | null): Promise<FiscalXmlResult> {
    return {
      kind: "obtido",
      xml: `<?xml version="1.0"?><mockNFe ref="${ref}" tipo="${tipoDoc}"/>`,
    };
  }

  async obterXmlCancelamento(_caminho: string | null, ref: string, tipoDoc: string, _config: ProviderConfig): Promise<FiscalXmlResult> {
    return {
      kind: "obtido",
      xml: `<?xml version="1.0"?><mockCancelamento ref="${ref}" tipo="${tipoDoc}"/>`,
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
/** Tipo estrutural mínimo (não o `FiscalDoc` completo) — Missão final (C3):
 * também usada pelo passo de XML (`XmlDoc`, fiscal_xml_orchestration.ts),
 * que não carrega `payload`/`tentativas`. Qualquer `FiscalDoc` já satisfaz
 * este tipo estruturalmente, então nenhum chamador existente muda. */
export function resolveFocusRef(doc: { id: string; venda_id: string }): string {
  const refField = (Deno.env.get("FISCAL_FOCUS_REF_FIELD") ?? "documento_id").toLowerCase();
  return refField === "venda_id" ? doc.venda_id : doc.id;
}

export type BuildFocusEmitBodyResult = {
  body: Record<string, unknown>;
  bloqueante: boolean;
  gaps: string[];
  /** Sprint C2.10 (P0-3) — metadados internos do FastProduct (nunca vão no
   * wire) para uso em logs/mensagens de erro do próprio worker. */
  internalMeta: { ref: string; documento_id: string; venda_id: string; tipo_doc: string; correlation_id: string | null };
};

/**
 * Sprint C2.9 (P0-3, achado Codex): `buildFocusNfceEnvelope` já computava
 * `bloqueante`, mas nada olhava para esse campo — o POST acontecia de
 * qualquer forma, com um payload conhecidamente incompleto. Corrigido: o
 * corpo retornado agora vem junto com `bloqueante`/`gaps`, e os dois
 * chamadores (`FocusProvider.callProvider`/`emitirNfe`) verificam antes de
 * montar a URL e disparar `postFocusEmit` — gap bloqueante = ZERO chamada
 * HTTP de emissão.
 *
 * Também removido `_fastproduct_dto_gaps` do corpo (`body`) — um campo
 * interno do FastProduct nunca deveria ter sido enviado no payload real
 * para a Focus (contrato externo só aceita os campos que a própria Focus
 * documenta). Os gaps continuam disponíveis para quem chama esta função
 * (usados no motivo do erro fail-closed pelo chamador), só não vão mais
 * no wire.
 *
 * Exportada como função de módulo (não método privado) — Sprint C2.9
 * (P0-8): testável direto, sem precisar instanciar `FocusProvider` nem
 * simular fetch, para provar shape/frescor de `data_emissao` isoladamente
 * do gate de bloqueante.
 *
 * Sprint C2.10 (P0-3, achado Codex): o corpo (`body`) enviado à Focus era
 * "snapshot menos alguns campos" — `ref`/`documento_id`/`venda_id`/
 * `tipo_doc`/`correlation_id` (identificadores 100% internos do
 * FastProduct, nunca documentados pela Focus) iam junto no JSON do POST.
 * Corrigido para ALLOWLIST: `body` agora é só `{...known (campos do
 * contrato Focus já confirmados por buildFocusNfceEnvelope), data_emissao}`
 * — nada mais entra. `ref` continua transportado do jeito CONFIRMADO
 * (query string da URL, ver `buildFocusEmitUrl`/`buildFocusConsultaUrl`) —
 * só parou de ser DUPLICADO como campo do corpo, o que nunca foi
 * confirmado como parte do contrato. Os identificadores internos
 * continuam disponíveis via `internalMeta`, só não vão mais no wire —
 * usados só para logging/mensagens de erro do próprio worker.
 */
export function buildFocusEmitBody(doc: FiscalDoc, ref: string): BuildFocusEmitBodyResult {
  const { body: known, gaps, bloqueante } = buildFocusNfceEnvelope(doc.payload, doc.tipo_doc);
  return {
    body: {
      ...known,
      // Gate C2.5: `data_emissao` NUNCA vem do snapshot congelado
      // (`payload.data_venda`) — a Focus exige data/hora próxima do
      // momento real do envio HTTP, com timezone. Calculado aqui, no
      // instante exato do POST, não em C1 (que corretamente continua
      // congelando só `data_venda`, o fato de negócio). Ver
      // docs/audits/AUDITORIA_PRONTIDAO_FOCUS_NFE_FASE_C_GATE_C2_5.md.
      data_emissao: new Date().toISOString(),
    },
    bloqueante,
    gaps: gaps.map((g) => g.campo),
    internalMeta: { ref, documento_id: doc.id, venda_id: doc.venda_id, tipo_doc: doc.tipo_doc, correlation_id: doc.correlation_id ?? null },
  };
}

/** Sprint C2.9 (P0-8) — extraída de método privado para função de módulo
 * testável direto (auth header, timeout/abort, corpo enviado), sem depender
 * de um DTO "completo" que hoje não existe de verdade (ver nota em
 * `buildFocusEmitBody`/`classifyFocusEmitResponse`). */
export async function postFocusEmit(url: string, token: string, body: Record<string, unknown>, timeout: number): Promise<FocusRemoteState> {
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

/**
 * Sprint P0 Focus — resolve o link de um artefato devolvido pela Focus
 * (`caminho_xml_nota_fiscal`, `caminho_xml_cancelamento`) usando SOMENTE o
 * valor devolvido:
 *   - URL absoluta `https://...` -> usada exatamente como veio;
 *   - caminho relativo começando com `/` (não `//`) -> resolvido contra a URL
 *     base do MESMO ambiente Focus que devolveu o valor (`config.url`), sem
 *     acrescentar `/v2` nem nenhum outro segmento;
 *   - qualquer outra forma (http sem TLS, `//host`, esquema diferente, vazio)
 *     -> recusado. Nunca inventa host.
 */
export function resolveFocusArtefatoUrl(caminho: string | null | undefined, baseUrl: string | null | undefined): string | null {
  const valor = (caminho ?? "").trim();
  if (!valor) return null;
  if (/^https:\/\//i.test(valor)) {
    try {
      return new URL(valor).toString();
    } catch {
      return null;
    }
  }
  if (valor.startsWith("/") && !valor.startsWith("//")) {
    const base = (baseUrl ?? "").trim();
    if (!/^https:\/\//i.test(base)) return null;
    try {
      const origem = new URL(base);
      return new URL(valor, origem.origin).toString();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Sprint P0 Focus — checagem de XML bem formado (sem DOMParser no runtime
 * das Edge Functions): exige um único elemento raiz e tags balanceadas;
 * aceita declaração `<?xml ...?>`, comentários, CDATA e DOCTYPE.
 */
export function isWellFormedXml(text: string): boolean {
  const s = text.replace(/^\uFEFF/, "").trim();
  if (!s.startsWith("<")) return false;
  const stack: string[] = [];
  let i = 0;
  let raizes = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      if (stack.length === 0 && s.slice(i).trim() !== "") return false;
      break;
    }
    if (stack.length === 0 && s.slice(i, lt).trim() !== "") return false;
    if (s.startsWith("<?", lt)) {
      const end = s.indexOf("?>", lt + 2);
      if (end === -1) return false;
      i = end + 2;
      continue;
    }
    if (s.startsWith("<!--", lt)) {
      const end = s.indexOf("-->", lt + 4);
      if (end === -1) return false;
      i = end + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", lt)) {
      if (stack.length === 0) return false;
      const end = s.indexOf("]]>", lt + 9);
      if (end === -1) return false;
      i = end + 3;
      continue;
    }
    if (s.startsWith("<!", lt)) {
      if (raizes > 0 || stack.length > 0) return false;
      const end = s.indexOf(">", lt + 2);
      if (end === -1) return false;
      i = end + 1;
      continue;
    }
    const gt = s.indexOf(">", lt + 1);
    if (gt === -1) return false;
    const conteudo = s.slice(lt + 1, gt);
    if (conteudo.startsWith("/")) {
      const nome = conteudo.slice(1).trim();
      if (stack.pop() !== nome) return false;
    } else {
      const m = /^([A-Za-z_][\w.:-]*)/.exec(conteudo);
      if (!m) return false;
      const autoFechada = conteudo.trimEnd().endsWith("/");
      if (stack.length === 0) {
        raizes += 1;
        if (raizes > 1) return false;
      }
      if (!autoFechada) stack.push(m[1]);
    }
    i = gt + 1;
  }
  return raizes === 1 && stack.length === 0;
}

/**
 * Sprint P0 Focus — GET no link devolvido pela Focus. Contrato confirmado:
 * links sem autenticação e sem expiração — por isso NUNCA envia
 * `Authorization` (nem Basic, nem o token da empresa). Valida HTTP 2xx e XML
 * bem formado antes de devolver `obtido`.
 */
export async function baixarXmlFocus(caminho: string | null, baseUrl: string | null | undefined, timeout: number): Promise<FiscalXmlResult> {
  if (!caminho || !caminho.trim()) {
    return { kind: "erro_transitorio", motivo: "FOCUS_XML_REFERENCIA_AUSENTE" };
  }
  const url = resolveFocusArtefatoUrl(caminho, baseUrl);
  if (!url) {
    return { kind: "erro_definitivo", motivo: "FOCUS_XML_CAMINHO_INVALIDO" };
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    if (!res.ok) {
      await res.body?.cancel();
      return {
        kind: httpStatusIsTransient(res.status) || res.status === 404 ? "erro_transitorio" : "erro_definitivo",
        motivo: `FOCUS_XML_HTTP_${res.status}`,
      };
    }
    const xml = await res.text();
    if (!isWellFormedXml(xml)) {
      return { kind: "erro_definitivo", motivo: "FOCUS_XML_CONTEUDO_INVALIDO" };
    }
    return { kind: "obtido", xml };
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    return { kind: "erro_transitorio", motivo: isAbort ? "FOCUS_XML_TIMEOUT" : "FOCUS_XML_FALHA_REDE" };
  } finally {
    clearTimeout(t);
  }
}

/** Justificativa do cancelamento: 15 a 255 caracteres (documentação Focus,
 * registrada na Fase B). */
export function justificativaCancelamentoValida(justificativa: string | null | undefined): boolean {
  const n = (justificativa ?? "").trim().length;
  return n >= 15 && n <= 255;
}

/** Sprint P0 Focus — resposta do DELETE de cancelamento. Só `status =
 * cancelado` confirma o cancelamento; qualquer outra resposta 2xx é erro
 * explícito (nunca presumido cancelado). */
export function classifyFocusCancelResponse(res: Response, record: Record<string, unknown>): FocusRemoteState {
  const porStatus = classifyByFocusStatus(record);
  if (porStatus?.kind === "cancelado") return porStatus;
  if (!res.ok) {
    const { code, message } = extractErrorCodeMessage(record);
    const errorCode = code ?? `HTTP_${res.status}`;
    const kind = httpStatusIsTransient(res.status) ? "erro_transitorio" as const : "erro_definitivo" as const;
    return { kind, erro: errorCode, http_status: res.status, provider_code: errorCode, provider_message: message, payload: record };
  }
  if (porStatus && porStatus.kind === "erro_transitorio") return porStatus;
  const { code, message } = extractErrorCodeMessage(record);
  return {
    kind: "erro_definitivo",
    erro: "FOCUS_CANCELAMENTO_NAO_CONFIRMADO",
    http_status: res.status,
    provider_code: code ?? "FOCUS_CANCELAMENTO_NAO_CONFIRMADO",
    provider_message: message,
    payload: record,
  };
}

function focusConfigAusente(): FocusRemoteState {
  return {
    kind: "erro_definitivo",
    erro: "FOCUS_MISSING_URL_OR_TOKEN",
    http_status: null,
    provider_code: "FOCUS_MISSING_URL_OR_TOKEN",
    provider_message: "Config do provider sem URL base ou token resolvido.",
    payload: null,
  };
}

function focusErroDeRede(e: unknown): FocusRemoteState {
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
}

async function lerJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await res.json();
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export class FocusProvider implements FiscalProvider {
  private resolveRef(doc: FiscalDoc): string {
    return resolveFocusRef(doc);
  }

  /** C2.4 — mantém o contrato `ProviderResult` (2 estados) para quem ainda
   * usa `callProvider`. O worker usa `emitirDocumento`. */
  async callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> {
    return focusStateToProviderResult(await this.emitirDocumento(doc, config));
  }

  /** Sprint P0 Focus — emissão NFC-e/NF-e. Gap bloqueante = zero POST. */
  async emitirDocumento(doc: FiscalDoc, config: ProviderConfig): Promise<FocusRemoteState> {
    const { url, token, timeout = 30_000 } = config;
    if (!url?.trim() || !token?.trim()) return focusConfigAusente();
    const ref = this.resolveRef(doc);
    const { body, bloqueante, gaps } = buildFocusEmitBody(doc, ref);
    if (bloqueante) {
      return {
        kind: "erro_definitivo",
        erro: "FOCUS_DTO_INCOMPLETO",
        http_status: null,
        provider_code: "FOCUS_DTO_INCOMPLETO",
        provider_message: `Payload fiscal incompleto — bloqueado antes do POST (zero chamada HTTP). Campos: ${gaps.join(", ")}`,
        payload: { gaps },
      };
    }
    const requestUrl = buildFocusEmitUrl(url, doc.tipo_doc, ref);
    return await postFocusEmit(requestUrl, token, body, timeout);
  }

  /** C2.6 — mantido por compatibilidade; mesmo caminho de `emitirDocumento`. */
  async emitirNfe(doc: FiscalDoc, config: ProviderConfig): Promise<FocusRemoteState> {
    return await this.emitirDocumento(doc, config);
  }

  /** C2.5/C2.8 — consulta por referência (GET). Nunca emite; só lê. */
  async consultarDocumento(ref: string, tipoDoc: string, config: ProviderConfig): Promise<FocusRemoteState> {
    const { url, token, timeout = 30_000 } = config;
    if (!url?.trim() || !token?.trim()) return focusConfigAusente();
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
      return classifyFocusConsultaResponse(res, await lerJson(res));
    } catch (e) {
      return focusErroDeRede(e);
    } finally {
      clearTimeout(t);
    }
  }

  /** Sprint P0 Focus — DELETE /v2/nfce|nfe/{referencia} com `justificativa`
   * (15–255). Mesma URL da consulta, mesma referência — nunca outra. */
  async cancelarDocumento(ref: string, tipoDoc: string, justificativa: string, config: ProviderConfig): Promise<FocusRemoteState> {
    const { url, token, timeout = 30_000 } = config;
    if (!url?.trim() || !token?.trim()) return focusConfigAusente();
    if (!justificativaCancelamentoValida(justificativa)) {
      return {
        kind: "erro_definitivo",
        erro: "FOCUS_CANCELAMENTO_JUSTIFICATIVA_INVALIDA",
        http_status: null,
        provider_code: "FOCUS_CANCELAMENTO_JUSTIFICATIVA_INVALIDA",
        provider_message: "Justificativa deve ter entre 15 e 255 caracteres.",
        payload: null,
      };
    }
    const requestUrl = buildFocusConsultaUrl(url, tipoDoc, ref);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(requestUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${encodeFocusBasicAuth(token)}`,
        },
        body: JSON.stringify({ justificativa: justificativa.trim() }),
        signal: controller.signal,
      });
      return classifyFocusCancelResponse(res, await lerJson(res));
    } catch (e) {
      return focusErroDeRede(e);
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Sprint P0 Focus — XML autorizado a partir de `caminho_xml_nota_fiscal`
   * (persistido em `focus_xml_path`). Sem referência persistida, consulta a
   * MESMA referência (GET) para obtê-la; nunca emite. O link não exige
   * autenticação (contrato Focus) — o download não envia o token.
   */
  async obterXmlAutorizado(ref: string, tipoDoc: string, config: ProviderConfig, caminho?: string | null): Promise<FiscalXmlResult> {
    const timeout = config.timeout ?? 30_000;
    let caminhoEfetivo = caminho ?? null;
    if (!caminhoEfetivo) {
      const estado = await this.consultarDocumento(ref, tipoDoc, config);
      if (estado.kind === "autorizado") caminhoEfetivo = estado.artefatos?.xml_path ?? null;
      if (!caminhoEfetivo) {
        return { kind: "erro_transitorio", motivo: `FOCUS_XML_REFERENCIA_AUSENTE:consulta=${estado.kind}` };
      }
      const xml = await baixarXmlFocus(caminhoEfetivo, config.url, timeout);
      return xml.kind === "obtido" ? { ...xml, caminho_recuperado: caminhoEfetivo, artefatos: estado.kind === "autorizado" ? estado.artefatos : undefined } : xml;
    }
    return await baixarXmlFocus(caminhoEfetivo, config.url, timeout);
  }

  /** Sprint P0 Focus — XML de cancelamento a partir de
   * `caminho_xml_cancelamento`. Sem caminho: erro (fila tenta de novo). */
  async obterXmlCancelamento(caminho: string | null, _ref: string, _tipoDoc: string, config: ProviderConfig): Promise<FiscalXmlResult> {
    return await baixarXmlFocus(caminho, config.url, config.timeout ?? 30_000);
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
