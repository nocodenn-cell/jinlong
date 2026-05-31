import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { type Idioma } from './normalizeIdioma'
import { type PerfilUsuario } from './normalizePerfilUsuario'

export type { PerfilUsuario } from './normalizePerfilUsuario'

export async function getUsuarioIdioma(): Promise<{
  idioma: Idioma
  perfil: PerfilUsuario
}> {
  const { idioma, perfil } = await getUsuarioAtual()
  return { idioma, perfil }
}

/** Inclui ADMIN (mesmo acesso de painel que gerente/dono no app; RLS em migração 044). */
export function isGerenteOuDono(perfil: PerfilUsuario): boolean {
  return isPerfilPainelGerencial(perfil)
}
