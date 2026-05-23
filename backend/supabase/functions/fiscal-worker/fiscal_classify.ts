import type { FiscalNormalizedError } from "./fiscal_types.ts";

/**
 * SEFAZ numeric rejection codes → classification.
 * Permanent (retryable=false): cadastral/fiscal-rule problems that require human correction.
 * Transient (retryable=true): infrastructure/authorization window issues.
 */
const SEFAZ_CODE_MAP: Record<number, Pick<FiscalNormalizedError, "error_code" | "error_category" | "action_hint" | "retryable">> = {
  // Cadastral / data errors — permanent
  225: { error_code: "SEFAZ_225", error_category: "DADOS_CADASTRAIS_INVALIDOS", action_hint: "CNPJ do emitente nao habilitado na SEFAZ. Verificar cadastro e reprocessar.", retryable: false },
  226: { error_code: "SEFAZ_226", error_category: "DADOS_CADASTRAIS_INVALIDOS", action_hint: "Inscricao Estadual do emitente invalida. Corrigir cadastro.", retryable: false },
  227: { error_code: "SEFAZ_227", error_category: "DADOS_CADASTRAIS_INVALIDOS", action_hint: "CNPJ do emitente invalido. Corrigir cadastro.", retryable: false },
  228: { error_code: "SEFAZ_228", error_category: "DADOS_CADASTRAIS_INVALIDOS", action_hint: "Data de emissao fora do prazo permitido. Corrigir data.", retryable: false },
  302: { error_code: "SEFAZ_302", error_category: "DADOS_CADASTRAIS_INVALIDOS", action_hint: "IE do destinatario invalida. Corrigir cadastro do destinatario.", retryable: false },
  384: { error_code: "SEFAZ_384", error_category: "DADOS_CADASTRAIS_INVALIDOS", action_hint: "CNPJ/CPF do destinatario invalido. Corrigir cadastro.", retryable: false },
  // Fiscal rule errors — permanent
  230: { error_code: "SEFAZ_230", error_category: "REJEICAO_REGRA_FISCAL", action_hint: "CFOP invalido para operacao. Corrigir CFOP e reenviar.", retryable: false },
  240: { error_code: "SEFAZ_240", error_category: "REJEICAO_REGRA_FISCAL", action_hint: "NCM invalido. Corrigir NCM do produto.", retryable: false },
  // Duplicate — permanent (idempotency violation)
  204: { error_code: "SEFAZ_204", error_category: "DUPLICATA", action_hint: "NF-e ja foi autorizada com esta chave. Verificar se ja existe documento emitido.", retryable: false },
  // Authorization window / transient
  109: { error_code: "SEFAZ_109", error_category: "SERVICO_INDISPONIVEL", action_hint: "Servico SEFAZ temporariamente indisponivel. Reprocessar automaticamente.", retryable: true },
  108: { error_code: "SEFAZ_108", error_category: "SERVICO_INDISPONIVEL", action_hint: "Servico SEFAZ em manutencao. Reprocessar apos janela de manutencao.", retryable: true },
};

function extractSefazCode(message: string): number | null {
  // SEFAZ rejeicao codes are 3-digit numbers, often preceded by "rejeicao" or standalone
  const match = message.match(/\brejeic[aã]o[:\s]+(\d{3})\b/i) ?? message.match(/\b([12]\d{2}|[3-9]\d{2})\b/);
  if (!match) return null;
  const code = parseInt(match[1] ?? match[0], 10);
  return code >= 100 && code <= 999 ? code : null;
}

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

  // Structured SEFAZ rejection code lookup — takes priority over text heuristics
  const sefazCode = extractSefazCode(message);
  if (sefazCode !== null && SEFAZ_CODE_MAP[sefazCode]) {
    const entry = SEFAZ_CODE_MAP[sefazCode];
    return {
      ...entry,
      next_step_url: "/gerente/financeiro?tab=fiscal",
      details: { ...(input.payload ?? {}), sefaz_code: sefazCode },
    };
  }

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
