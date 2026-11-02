import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { ROUTES } from '@/lib/navigation/routes'

/**
 * Destino do atalho "Painel de gestão" no PDV. Só perfis com acesso ao painel
 * (GERENTE, DONO — a mesma regra do middleware e do login) recebem o
 * link; OPERADOR e perfil desconhecido/ausente não veem nada, então o menu do
 * operador de caixa continua exatamente como era.
 */
export function painelGestaoHrefParaPerfil(perfil: string | null | undefined): string | null {
  return isPerfilPainelGerencial(perfil) ? ROUTES.admin.dashboard : null
}
