import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

export type LadoBaixa = 'AP' | 'AR'

/** Título escolhido na linha, aplicado só no formulário da conta financeira. */
export type FocoTituloConta = {
  tipo: LadoBaixa
  id: string
  rotulo: string
}

/**
 * Caixa passa por `assertGerenteSession`. Conta passa por `assertAdminSession`.
 * Os dois guards aceitam GERENTE, DONO e ADMIN. OPERADOR não entra no painel.
 */
export function baixasAutorizadas(perfil: string | null | undefined): { caixa: boolean; conta: boolean } {
  const permitido = isPerfilPainelGerencial(perfil)
  return { caixa: permitido, conta: permitido }
}

export function mesmaLojaDaBaixa(actorLojaId: string | null | undefined, lojaId: string): boolean {
  return actorLojaId == null || actorLojaId === lojaId
}

export function opcoesComFoco<T extends { id: string }>(
  titulos: readonly T[],
  foco: FocoTituloConta | null,
  tipo: LadoBaixa,
  extra: T,
): T[] {
  if (!foco || foco.tipo !== tipo || titulos.some((t) => t.id === foco.id)) return [...titulos]
  return [extra, ...titulos]
}
