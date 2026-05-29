/**
 * Filtro PostgREST `.or()` para excluir regras de preço vencidas no carregamento do caixa.
 *
 * Regra: aplica-se quando `data_validade` é NULL (sem validade) OU >= agora.
 * Mantido puro (sem `server-only`) para ser testável — garante que o token gerado
 * é um filtro PostgREST válido (col.op.val separados por vírgula, sem caracteres que
 * quebrem o parser de `or()`), evitando falha no bootstrap do caixa.
 */
export function buildRegrasPrecoValidadeOrFilter(now: Date = new Date()): string {
  return `data_validade.is.null,data_validade.gte.${now.toISOString()}`
}
