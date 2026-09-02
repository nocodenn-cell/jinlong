export type FiscalDoc = {
  id: string;
  venda_id: string;
  tipo_doc: string;
  tentativas?: number;
  correlation_id?: string;
  payload: Record<string, unknown> | null;
};

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
 * Onda C2.9 (prontidão Focus NFe) — resultado canônico interno, traduzido pelo
 * adapter a partir da resposta real da Focus. Nada além destes 6 estados escapa
 * do adapter para o domínio (index.ts, RPCs, timeline) — nomes/campos da Focus
 * ficam contidos aqui.
 *
 * Nota honesta (não inventada): a distinção entre `rejeitado` e `erro_definitivo`,
 * e entre `processando` (via consulta) e outras respostas ambíguas, usa heurística
 * best-effort (presença/ausência de chave+protocolo reconhecíveis) porque a
 * documentação fornecida a esta missão não incluiu o schema exato do corpo de
 * resposta da Focus (nem para emissão nem para consulta) — só a lista de
 * informações que a consulta "pode retornar". Validar contra resposta real de
 * homologação antes de confiar cegamente nesta distinção em produção.
 */
export type FocusRemoteState =
  | {
    kind: "autorizado";
    chave_fiscal: string;
    protocolo: string;
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
