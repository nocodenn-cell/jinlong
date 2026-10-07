export type FiscalDoc = {
  id: string;
  venda_id: string;
  tipo_doc: string;
  tentativas?: number;
  /**
   * Sprint C2.9 (P0-1, auditoria Codex) — TRUE se este documento já foi
   * reclamado (EM_PROCESSAMENTO) em algum momento ANTES da chamada atual de
   * `fiscal_claim_documentos`, independente de `tentativas` ter sido
   * resetada por DLQ/reprocessamento manual. É o sinal que sobrevive a
   * retry/restart/reaper/DLQ/reprocessamento/crash — `tentativas` NÃO
   * sobrevive (fiscal_reprocessar_documento zera ao resgatar da DLQ) e por
   * isso nunca deve ser usada para decidir se é seguro pular a consulta
   * antes de reemitir (ver `enforceRetrySafeGate`).
   */
  ja_tentou_emissao_antes?: boolean;
  correlation_id?: string;
  payload: Record<string, unknown> | null;
};

/**
 * Missão final (C3) — resultado canônico de "obter o XML autorizado deste
 * documento", devolvido por `FiscalProvider.obterXmlAutorizado` (método
 * opcional, mesmo padrão de `consultarDocumento`/`emitirNfe`). Contrato
 * GET-only por construção: nenhuma implementação deste método pode chamar
 * POST /v2/nfce ou /v2/nfe — ver `fiscal-provider-adapter.ts`.
 */
export type FiscalXmlResult =
  | { kind: "obtido"; xml: string }
  | { kind: "blocked_external"; motivo: string }
  | { kind: "erro_transitorio"; motivo: string }
  | { kind: "erro_definitivo"; motivo: string };

export type ProviderResult =
  | {
    ok: true;
    chave_fiscal: string;
    protocolo: string;
    provider_ref?: string | null;
    payload?: Record<string, unknown> | null;
  }
  | {
    ok: false;
    erro: string;
    transitorio: boolean;
    http_status?: number | null;
    provider_code?: string | null;
    provider_message?: string | null;
    payload?: Record<string, unknown> | null;
  };

export type FiscalNormalizedError = {
  error_code: string;
  error_category: string;
  action_hint: string;
  retryable: boolean;
  next_step_url: string | null;
  details: Record<string, unknown> | null;
};

/**
 * Resultado canônico interno Focus → domínio. Nomes/campos da Focus ficam no adapter.
 *
 * Status Focus confirmados (docs oficiais / SDK): `processando_autorizacao`,
 * `autorizado`, `cancelado`, `erro_autorizacao`, `denegado`.
 *
 * GO CONDICIONAL P0: `cancelado` é first-class. Em consulta, o campo `status`
 * DEVE ser lido ANTES de chave/protocolo — documento cancelado frequentemente
 * ainda carrega chave/protocolo da autorização anterior; classificar como
 * `autorizado` chamaria `fiscal_marcar_emitido` e corromperia o SSoT fiscal.
 */
export type FocusRemoteState =
  | {
    kind: "autorizado";
    chave_fiscal: string;
    protocolo: string;
    provider_ref: string | null;
    payload: Record<string, unknown> | null;
  }
  | {
    kind: "cancelado";
    chave_fiscal: string | null;
    protocolo: string | null;
    provider_ref: string | null;
    payload: Record<string, unknown> | null;
  }
  | { kind: "processando"; payload: Record<string, unknown> | null }
  | {
    kind: "rejeitado";
    erro: string;
    provider_code: string | null;
    provider_message: string | null;
    payload: Record<string, unknown> | null;
  }
  | { kind: "nao_encontrado" }
  | {
    kind: "erro_transitorio";
    erro: string;
    http_status: number | null;
    provider_code: string | null;
    provider_message: string | null;
    payload: Record<string, unknown> | null;
  }
  | {
    kind: "erro_definitivo";
    erro: string;
    http_status: number | null;
    provider_code: string | null;
    provider_message: string | null;
    payload: Record<string, unknown> | null;
  };
