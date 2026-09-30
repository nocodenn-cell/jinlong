export type PerfilUsuario = 'OPERADOR' | 'GERENTE' | 'DONO' | 'ADMIN'

const PERFIS_VALIDOS: ReadonlySet<PerfilUsuario> = new Set([
  'OPERADOR',
  'GERENTE',
  'DONO',
  'ADMIN',
])

export function normalizePerfilUsuario(perfil: string | null | undefined): PerfilUsuario {
  const normalized = perfil?.trim().toUpperCase()
  return normalized && PERFIS_VALIDOS.has(normalized as PerfilUsuario)
    ? (normalized as PerfilUsuario)
    : 'OPERADOR'
}
