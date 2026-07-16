/**
 * Regras de conta de usuário (staff/operador). Decisão de negócio fora da UI:
 * a tela só pergunta ao core se a conta pode acessar — nunca ramifica por
 * `.ativo` diretamente (enforçado por scripts/core-rule-guard.mjs).
 *
 * Modelo: CORE (decide) → SERVER (executa) → UI (apresenta).
 */

export type ContaUsuarioLike = {
  ativo?: boolean | null
}

/**
 * Conta explicitamente desativada. Leitura conservadora: só bloqueia quando
 * `ativo === false`; ausente/indefinido NÃO é tratado como desativado (mantém
 * a semântica histórica do login).
 */
export function isContaDesativada(usuario: ContaUsuarioLike): boolean {
  return usuario.ativo === false
}
