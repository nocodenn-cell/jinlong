/**
 * Regra única de "conta ativa" — usada tanto pelo bloqueio de sessão
 * server/edge (`lib/admin/auth/sessionConsistency.ts`, autoridade real: uma
 * conta desativada não acessa nenhuma rota protegida) quanto pela UX
 * antecipada de login (`app/login/LoginForm.tsx`, sign-out imediato +
 * mensagem amigável). Antes da extração, os dois pontos reimplementavam o
 * mesmo literal `.ativo === false` de forma independente.
 *
 * `false` bloqueia; `null`/ausente é tratado como ativo (compat com linhas
 * antigas sem o campo preenchido).
 */
export function isContaAtiva(ativo: boolean | null | undefined): boolean {
  return ativo !== false
}
