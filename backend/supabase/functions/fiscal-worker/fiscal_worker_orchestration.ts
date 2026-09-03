// Onda C2 (prontidão Focus NFe) — orquestração entre o resultado canônico do
// adapter (`FocusRemoteState`) e as RPCs/máquina de estados JÁ EXISTENTES
// (fiscal_marcar_emitido/fiscal_marcar_erro/fiscal_marcar_erro_normalizado).
// Extraído do laço principal de `index.ts` para ser testável com fake do
// Supabase client, sem precisar simular um `Deno.serve` inteiro.
//
// Reforça o boundary: nenhuma função aqui cria estado novo em
// documentos_fiscais_pendentes.status. "processando" (NF-e 202) resulta em
// NENHUMA chamada de RPC — o documento já está EM_PROCESSAMENTO desde o claim
// (fiscal_claim_documentos), e esse status já é exatamente o que 202 significa.

import type { FiscalDoc, FocusRemoteState } from "./fiscal_types.ts";
import { classifyFiscalError } from "./fiscal_classify.ts";
import { isRecord } from "./fiscal_http.ts";
import type { FiscalCredentialErrorCode } from "./fiscal_credential_resolver.ts";
import type { ProviderConfig } from "./fiscal-provider-adapter.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export type WorkerCounters = {
  emitted: string[];
  failed: Array<{ id: string; erro: string }>;
  retried: Array<{ id: string; proxima_tentativa: string | null }>;
};

export function extractLojaId(payload: Record<string, unknown> | null): string | null {
  if (!isRecord(payload)) return null;
  const v = payload.loja_id;
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** C2.1 — falha fechada de resolução de credencial: zero HTTP já aconteceu (o
 * chamador nem chega a instanciar o provider); aqui só registramos o motivo na
 * mesma trilha de erro já existente, sem inventar RPC nova. Não-retryable —
 * é problema de configuração, não vai se resolver sozinho com backoff. */
export async function applyCredentialResolutionFailure(
  supabase: SupabaseLike,
  doc: FiscalDoc,
  code: FiscalCredentialErrorCode,
  counters: WorkerCounters,
): Promise<void> {
  const normalized = classifyFiscalError({
    erro: code,
    transitorio: false,
    httpStatus: null,
    providerCode: code,
    providerMessage: "Resolução de credencial fiscal multiempresa falhou antes de qualquer chamada HTTP.",
    payload: null,
  });
  const { error } = await supabase.rpc("fiscal_marcar_erro_normalizado", {
    p_documento_id: doc.id,
    p_erro: code,
    p_transitorio: false,
    p_error_code: code,
    p_error_category: "CONFIGURACAO_FISCAL_AUSENTE",
    p_action_hint: "Configurar/habilitar fiscal_provider_config para esta loja+ambiente e garantir o secret correspondente.",
    p_retryable: false,
    p_next_step_url: normalized.next_step_url,
    p_error_payload: null,
  });
  if (error) {
    counters.failed.push({ id: doc.id, erro: `MARCAR_ERRO_NORMALIZADO_FAILED:${error.message}` });
  } else {
    counters.failed.push({ id: doc.id, erro: code });
  }
}

/**
 * Traduz um `FocusRemoteState` (emissão OU consulta) para a RPC certa. Usada
 * tanto pela emissão de NF-e (3 estados) quanto pelo retry-seguro (C2.7) e pela
 * reconciliação (C2.8) — mesmo tradutor para os três casos, sem duplicar lógica.
 */
export async function applyFocusRemoteState(
  supabase: SupabaseLike,
  doc: FiscalDoc,
  estado: FocusRemoteState,
  counters: WorkerCounters,
): Promise<void> {
  switch (estado.kind) {
    case "autorizado": {
      const { error } = await supabase.rpc("fiscal_marcar_emitido", {
        p_documento_id: doc.id,
        p_chave_fiscal: estado.chave_fiscal,
        p_protocolo: estado.protocolo,
        p_provider_ref: estado.provider_ref ?? null,
        p_payload: estado.payload ?? null,
      });
      if (error) {
        counters.failed.push({ id: doc.id, erro: `MARCAR_EMITIDO_ERROR:${error.message}` });
        const { error: retryErr } = await supabase.rpc("fiscal_marcar_erro", {
          p_documento_id: doc.id,
          p_erro: `MARCAR_EMITIDO_ERROR:${error.message}`,
          p_transitorio: true,
        });
        if (!retryErr) counters.retried.push({ id: doc.id, proxima_tentativa: null });
      } else {
        counters.emitted.push(doc.id);
      }
      break;
    }

    case "processando": {
      // Nenhuma RPC — status já é EM_PROCESSAMENTO desde o claim. Reconciliação
      // (não este laço) resolve depois via consulta.
      break;
    }

    case "rejeitado":
    case "erro_definitivo": {
      const httpStatus = "http_status" in estado ? estado.http_status : null;
      const normalized = classifyFiscalError({
        erro: estado.erro,
        transitorio: false,
        httpStatus,
        providerCode: estado.provider_code,
        providerMessage: estado.provider_message,
        payload: estado.payload,
      });
      const { error } = await supabase.rpc("fiscal_marcar_erro_normalizado", {
        p_documento_id: doc.id,
        p_erro: estado.erro,
        p_transitorio: false,
        p_error_code: normalized.error_code,
        p_error_category: normalized.error_category,
        p_action_hint: normalized.action_hint,
        p_retryable: false,
        p_next_step_url: normalized.next_step_url,
        p_error_payload: normalized.details,
      });
      counters.failed.push({ id: doc.id, erro: error ? `MARCAR_ERRO_NORMALIZADO_FAILED:${error.message}` : estado.erro });
      break;
    }

    case "erro_transitorio": {
      const { error: retryErr } = await supabase.rpc("fiscal_marcar_erro", {
        p_documento_id: doc.id,
        p_erro: estado.erro,
        p_transitorio: true,
      });
      if (retryErr) {
        counters.failed.push({ id: doc.id, erro: `MARCAR_ERRO:${retryErr.message}` });
      } else {
        counters.retried.push({ id: doc.id, proxima_tentativa: null });
      }
      break;
    }

    case "nao_encontrado": {
      // Só relevante em contexto de consulta/retry-seguro — chamador decide
      // (ver `enforceRetrySafeGate` abaixo). Se chegar aqui de qualquer
      // forma, trata como erro definitivo leve.
      const { error } = await supabase.rpc("fiscal_marcar_erro_normalizado", {
        p_documento_id: doc.id,
        p_erro: "FOCUS_NAO_ENCONTRADO",
        p_transitorio: false,
        p_error_code: "FOCUS_NAO_ENCONTRADO",
        p_error_category: "DESCONHECIDO",
        p_action_hint: "Documento não encontrado na Focus pela referência — revisar manualmente.",
        p_retryable: false,
        p_next_step_url: "/gerente/financeiro?tab=fiscal",
        p_error_payload: null,
      });
      counters.failed.push({ id: doc.id, erro: error ? `MARCAR_ERRO_NORMALIZADO_FAILED:${error.message}` : "FOCUS_NAO_ENCONTRADO" });
      break;
    }
  }
}

export type RetrySafeGateResult = { proceed: true } | { proceed: false };

/**
 * Sprint de convergência (auditoria Codex, P0 "query-before-reemit") —
 * extraído do laço inline de `index.ts` (linhas 120-131 antes desta
 * mudança) para ser testável sem simular um `Deno.serve` inteiro, no mesmo
 * padrão já usado para `applyFocusRemoteState`/`applyCredentialResolutionFailure`
 * acima.
 *
 * Sprint C2.9 (P0-1, achado adicional do Codex): o gate original usava
 * `tentativas > 0` como sinal de "já existe tentativa anterior". Isso é um
 * bypass real — `fiscal_reprocessar_documento` zera `tentativas` ao resgatar
 * um documento da DLQ, então POST -> resultado desconhecido (crash/timeout)
 * -> reaper -> DLQ -> reprocessamento manual fazia o gate enxergar
 * `tentativas=0` e pular a consulta, permitindo um SEGUNDO POST para uma
 * emissão cujo resultado remoto real nunca foi confirmado. Trocado para
 * `doc.ja_tentou_emissao_antes` (`fiscal_claim_documentos`, migration
 * 20260903100000) — sinal derivado de `ultima_tentativa_em`, que nenhuma
 * operação da máquina de estados (reaper, DLQ, reprocessamento) reseta.
 *
 * Contrato: se este documento já foi reclamado antes (`ja_tentou_emissao_antes
 * === true`), o chamador NUNCA pode emitir um novo POST antes de consultar o
 * estado remoto pela mesma `ref`. Só um retorno `nao_encontrado` (Focus
 * confirma que a tentativa anterior nunca chegou a existir do lado dela)
 * libera `proceed: true`. Qualquer outro estado conhecido (autorizado/
 * processando/rejeitado/erro) é aplicado imediatamente via
 * `applyFocusRemoteState` (a MESMA função usada por emissão direta e por
 * reconciliação) e devolve `proceed: false` — o chamador deve pular a
 * emissão para este documento nesta rodada (`continue`), nunca reemitir.
 *
 * REVISÃO — Sprint C2.9 (P0-2, achado Codex): "um único nao_encontrado
 * torna seguro emitir de novo" é a única semântica CONFIRMADA pela
 * documentação oficial da Focus (404 = referência não encontrada — não é
 * rejeição fiscal, é ausência de registro). Não foi alterado para
 * fail-closed adicional porque isso exigiria inventar uma regra que a Focus
 * nunca documentou (ex.: "esperar N segundos antes de confiar num 404" —
 * nenhuma janela de propagação POST->GET foi confirmada). BLOQUEADOR
 * EXTERNO, registrado para o gate de homologação: confirmar com a Focus se
 * existe uma janela de inconsistência entre um POST aceito e um GET
 * imediatamente posterior pela mesma ref retornando 404 antes do
 * documento ser indexado do lado dela. Mitigação factual hoje (não uma
 * garantia): o backoff mínimo entre tentativas (`fiscal_marcar_erro`,
 * `power(2, tentativas)` segundos) e o timeout do reaper (padrão 15min)
 * tornam essa janela, se existir, muito menor que o intervalo real entre
 * duas tentativas — mas isso não substitui confirmação oficial.
 */
export async function enforceRetrySafeGate(
  supabase: SupabaseLike,
  doc: FiscalDoc,
  provider: { consultarDocumento?: (ref: string, tipoDoc: string, cfg: ProviderConfig) => Promise<FocusRemoteState> },
  ref: string,
  cfg: ProviderConfig,
  counters: WorkerCounters,
): Promise<RetrySafeGateResult> {
  if (!doc.ja_tentou_emissao_antes || !provider.consultarDocumento) {
    // Nunca reclamado antes (ou provider sem capacidade de consulta, ex.:
    // mock/http/bling legado): nada para reconciliar — segue para emissão
    // normalmente, mesmo comportamento de sempre.
    return { proceed: true };
  }
  const estadoRemoto = await provider.consultarDocumento(ref, doc.tipo_doc, cfg);
  if (estadoRemoto.kind !== "nao_encontrado") {
    await applyFocusRemoteState(supabase, doc, estadoRemoto, counters);
    return { proceed: false };
  }
  // nao_encontrado: Focus confirma que não processou esta ref — seguro emitir.
  return { proceed: true };
}
