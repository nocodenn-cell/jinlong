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
 * Nota honesta, atualizada no Gate C2.5 (2ª rodada): a documentação oficial
 * confirma que a consulta NFC-e/NF-e retorna, entre outros, os estados
 * "Processando autorização", "Autorizada", "Autorizada completa", "Cancelada"
 * e "Erro autorização" (além de 404 = referência não encontrada — CONFIRMADO,
 * mapeado 1:1 para `nao_encontrado`, não mais heurística). Isso confirma que
 * HTTP 200 sozinho não determina o estado — o body precisa ser interpretado —
 * mas o JSON exato de cada exemplo não foi obtido nesta sessão (WebFetch/
 * WebSearch indisponíveis). Duas lacunas residuais, deliberadamente NÃO
 * resolvidas por heurística nova:
 *   1. Não há tipo `cancelado` neste union — "Cancelada" é um estado real de
 *      consulta que hoje cairia em `processando` (2xx sem chave) ou
 *      `erro_definitivo`, dependendo de como a Focus estrutura o body — não
 *      adicionado sem saber detectar.
 *   2. `classifyFocusConsultaResponse` trata QUALQUER 2xx sem chave/protocolo
 *      como `processando` — mas agora sabemos que "Erro autorização" também
 *      pode ser um 2xx sem chave. Isso significa que uma consulta rejeitada
 *      pode hoje ser classificada incorretamente como "ainda processando" em
 *      vez de erro. Mantido deliberadamente no lado conservador (nunca
 *      declarar erro sem certeza) até termos o JSON real que distingue os
 *      dois casos — mas é um risco residual real, não apenas teórico, e deve
 *      ser resolvido antes de confiar em reconciliação automática real.
 * Validar contra resposta real de homologação antes de confiar cegamente
 * nesta distinção em produção.
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
