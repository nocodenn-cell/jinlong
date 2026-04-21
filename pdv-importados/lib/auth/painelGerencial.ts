/**
 * Perfis com acesso ao painel gerencial e rotas /gerente e /admin (alinhar ao middleware e RLS).
 * ADMIN: mesmo escopo de loja que GERENTE (não inclui visão macro exclusiva de DONO).
 *
 * RLS alinhada: `backend/supabase/migrations/044_usuario_perfil_admin_rls.sql` (e 042/043 loja).
 * Smoke: `backend/supabase/scripts/smoke_rls_painel_gerente.sql` + `backend/scripts/p0-rls-rest-smoke.mjs`.
 */
export const PERFIS_PAINEL_GERENCIAL = ['GERENTE', 'DONO', 'ADMIN'] as const

/** Prefixos de URL do Next middleware (`config.matcher`) — manter sincronizado. */
export const PREFIXOS_ROTAS_PAINEL_WEB = ['/gerente', '/admin'] as const

export type PerfilPainelGerencial = (typeof PERFIS_PAINEL_GERENCIAL)[number]

export function isPerfilPainelGerencial(
  perfil: string | null | undefined
): perfil is PerfilPainelGerencial {
  return (
    perfil === 'GERENTE' || perfil === 'DONO' || perfil === 'ADMIN'
  )
}
