import type { FiscalNormalizedError } from "./fiscal_types.ts";

export function classifyFiscalError(input: {
  erro: string;
  transitorio: boolean;
  httpStatus?: number | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  payload?: Record<string, unknown> | null;
}): FiscalNormalizedError {
  const message = [input.erro, input.providerCode, input.providerMessage].filter(Boolean).join(" | ");
  const lower = message.toLowerCase();
  const has = (parts: string[]) => parts.some((p) => lower.includes(p));
  const isTimeoutOrRate =
    input.httpStatus === 408 ||
    input.httpStatus === 429 ||
    input.httpStatus === 504 ||
    has(["timeout", "timed out", "time out", "rate limit", "too many requests", "abort"]);
  if (isTimeoutOrRate) {
    return {
      error_code: "TIMEOUT_OR_RATE_LIMIT",
      error_category: "TIMEOUT_RATE_LIMIT",
      action_hint: "Reprocessar automaticamente apos janela de retentativa; verificar limites do provider.",
      retryable: true,
      next_step_url: "/gerente/financeiro?tab=fiscal",
      details: input.payload ?? null,
    };
  }

  const isCadastroInvalido = has([
    "cnpj",
    "cpf",
    "inscricao",
    "inscrição",
    "ie invalida",
    "ie inválida",
    "cadastro",
    "destinatario",
    "destinatário",
    "endereco",
    "endereço",
  ]);
  if (isCadastroInvalido) {
    return {
      error_code: "CADASTRAL_DATA_INVALID",
      error_category: "DADOS_CADASTRAIS_INVALIDOS",
      action_hint: "Corrigir cadastro fiscal (CNPJ/CPF/IE/endereco) e reprocessar.",
      retryable: false,
      next_step_url: "/gerente/financeiro?tab=fiscal",
      details: input.payload ?? null,
    };
  }

  const isRegraFiscal = has(["sefaz", "rejeicao", "rejeição", "regra fiscal", "cfop", "cst", "ncm"]);
  if (isRegraFiscal) {
    return {
      error_code: "FISCAL_RULE_REJECTION",
      error_category: "REJEICAO_REGRA_FISCAL",
      action_hint: "Ajustar regra fiscal/documento e reenviar para autorizacao.",
      retryable: false,
      next_step_url: "/gerente/financeiro?tab=fiscal",
      details: input.payload ?? null,
    };
  }

  return {
    error_code: "PROVIDER_COMMUNICATION_FAILURE",
    error_category: "FALHA_COMUNICACAO_PROVIDER",
    action_hint: "Verificar conectividade, status do provider e credenciais da integracao fiscal.",
    retryable: input.transitorio || (input.httpStatus != null && input.httpStatus >= 500),
    next_step_url: "/gerente/financeiro?tab=fiscal",
    details: input.payload ?? null,
  };
}
