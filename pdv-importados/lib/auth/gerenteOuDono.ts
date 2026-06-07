import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'

export type GerenteAuth = { ok: true } | { ok: false; error: string }

/** @deprecated Use assertGerenteSession — shim de compatibilidade. */
export async function assertGerenteOuDono(): Promise<GerenteAuth> {
  const result = await assertGerenteSession()
  if (result.ok) return { ok: true }
  return { ok: false, error: result.error }
}
