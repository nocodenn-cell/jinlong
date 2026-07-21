export const ADMIN_DONO_REUSE_ERROR =
  'Este e-mail pertence a um administrador da plataforma. Use outro e-mail para o DONO.'

export function getDonoReuseError(perfil: unknown): string | null {
  const normalized = String(perfil)
  if (normalized === 'ADMIN') return ADMIN_DONO_REUSE_ERROR
  if (normalized !== 'DONO') {
    return `Este e-mail já existe com perfil ${normalized}. Use outro e-mail para o DONO.`
  }
  return null
}
