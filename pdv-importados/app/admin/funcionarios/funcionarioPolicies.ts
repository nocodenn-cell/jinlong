/** Perfis atribuíveis pela UI de funcionários (nunca ADMIN). */
export const PERFIS_FUNCIONARIO_UI = ['OPERADOR', 'GERENTE'] as const
export type PerfilFuncionarioUi = (typeof PERFIS_FUNCIONARIO_UI)[number]

export type AtorFuncionario = {
  id: string
  perfil: string
}

export type AlvoFuncionario = {
  id: string
  perfil: string
}

export function isPerfilFuncionarioUi(perfil: string): perfil is PerfilFuncionarioUi {
  return perfil === 'OPERADOR' || perfil === 'GERENTE'
}

/** Perfis que o ator pode atribuir a novos/editados funcionários. */
export function perfisAtribuiveisPorAtor(atorPerfil: string): readonly PerfilFuncionarioUi[] {
  if (atorPerfil === 'DONO') return PERFIS_FUNCIONARIO_UI
  if (atorPerfil === 'GERENTE') return ['OPERADOR']
  return []
}

export function podeAtribuirPerfil(atorPerfil: string, novoPerfil: string): boolean {
  return perfisAtribuiveisPorAtor(atorPerfil).includes(novoPerfil as PerfilFuncionarioUi)
}

/**
 * GERENTE só mexe em OPERADOR; DONO em OPERADOR e GERENTE. Linhas legadas ADMIN ficam protegidas.
 * DONO/ADMIN nunca são editados por esta tela (DONO via /admin/provisionamento; ADMIN via runbook).
 */
export function podeEditarAlvo(ator: AtorFuncionario, alvo: AlvoFuncionario): boolean {
  if (alvo.perfil === 'ADMIN' || alvo.perfil === 'DONO') return false
  if (alvo.perfil === 'GERENTE') return ator.perfil === 'DONO'
  if (alvo.perfil === 'OPERADOR') {
    return ator.perfil === 'DONO' || ator.perfil === 'GERENTE'
  }
  return false
}

export function podeDesativarAlvo(ator: AtorFuncionario, alvo: AlvoFuncionario): boolean {
  if (ator.id === alvo.id) return false
  return podeEditarAlvo(ator, alvo)
}
