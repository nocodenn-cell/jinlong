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
      // (ver `fiscal_worker_orchestration.ts` `shouldProceedWithEmit`). Se
      // chegar aqui de qualquer forma, trata como erro definitivo leve.
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
