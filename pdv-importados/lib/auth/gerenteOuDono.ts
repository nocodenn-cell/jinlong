import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

export type GerenteAuth = { ok: true } | { ok: false; error: string }

/**
 * Garante sessão autenticada e perfil GERENTE, DONO ou ADMIN (alinha às policies RLS).
 *
 * Reusa `getUsuarioAtual()` (cacheado por requisição): não dispara um novo
 * `auth.getUser()`/SELECT de perfil quando a sessão já foi resolvida no render.
 */
export async function assertGerenteOuDono(): Promise<GerenteAuth> {
  const { userId, perfil } = await getUsuarioAtual()

  if (!userId) return { ok: false, error: 'Faça login para continuar.' }

  if (!isPerfilPainelGerencial(perfil)) {
    return {
      ok: false,
      error: 'Esta área é só para gerente, dono ou administrador. Use uma conta com permissão.',
    }
  }
  return { ok: true }
}
