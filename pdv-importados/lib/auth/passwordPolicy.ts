/** Política mínima de senha — usada em recuperação e troca. */
export const PASSWORD_MIN_LENGTH = 8

export type PasswordValidation =
  | { ok: true }
  | { ok: false; code: 'TOO_SHORT' | 'MISMATCH' | 'EMPTY' }

export function validateNewPassword(password: string, confirm: string): PasswordValidation {
  const p = password.trim()
  const c = confirm.trim()
  if (!p) return { ok: false, code: 'EMPTY' }
  if (p.length < PASSWORD_MIN_LENGTH) return { ok: false, code: 'TOO_SHORT' }
  if (p !== c) return { ok: false, code: 'MISMATCH' }
  return { ok: true }
}
