/**
 * Perfis com acesso ao painel gerencial e rotas /gerente e /admin (alinhar ao middleware e RLS).
 * ADMIN: mesmo escopo de loja que GERENTE (não inclui visão macro exclusiva de DONO).
 */
export const PERFIS_PAINEL_GERENCIAL = ['GERENTE', 'DONO', 'ADMIN'] as const

export type PerfilPainelGerencial = (typeof PERFIS_PAINEL_GERENCIAL)[number]

export function isPerfilPainelGerencial(
  perfil: string | null | undefined
): perfil is PerfilPainelGerencial {
  return (
    perfil === 'GERENTE' || perfil === 'DONO' || perfil === 'ADMIN'
  )
}
