export type StatusFiltro = 'todos' | 'ativos' | 'inativos'
export type PerfilFiltro = 'todos' | 'OPERADOR' | 'GERENTE'

export const FUNCIONARIOS_LISTA_KEY = 'jinlong.funcionarios.lista.v1'

export type FuncionariosListaEstado = {
  termo: string
  status: StatusFiltro
  perfil: PerfilFiltro
  scrollY: number
  adminAberto: boolean
}

export function lerFuncionariosListaEstado(raw: string | null): FuncionariosListaEstado | null {
  if (!raw) return null
  try {
    return normalizarEstado(JSON.parse(raw) as Partial<FuncionariosListaEstado>)
  } catch {
    return null
  }
}

export function serializarFuncionariosListaEstado(estado: FuncionariosListaEstado): string {
  return JSON.stringify(estado)
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Mantém a posição já salva quando o chamador não informa um scroll novo. */
export function gravarFuncionariosListaEstado(
  storage: StorageLike,
  estado: Omit<FuncionariosListaEstado, 'scrollY'> & { scrollY?: number },
): void {
  const anterior = lerFuncionariosListaEstado(storage.getItem(FUNCIONARIOS_LISTA_KEY))
  storage.setItem(
    FUNCIONARIOS_LISTA_KEY,
    serializarFuncionariosListaEstado({
      termo: estado.termo,
      status: estado.status,
      perfil: estado.perfil,
      adminAberto: estado.adminAberto,
      scrollY: estado.scrollY ?? anterior?.scrollY ?? 0,
    }),
  )
}

function normalizarEstado(v: Partial<FuncionariosListaEstado>): FuncionariosListaEstado | null {
  if (!statusValido(v.status) || !perfilValido(v.perfil)) return null
  return {
    termo: typeof v.termo === 'string' ? v.termo : '',
    status: v.status,
    perfil: v.perfil,
    scrollY: typeof v.scrollY === 'number' && v.scrollY >= 0 ? v.scrollY : 0,
    adminAberto: v.adminAberto === true,
  }
}

function statusValido(v: unknown): v is StatusFiltro {
  return v === 'todos' || v === 'ativos' || v === 'inativos'
}

function perfilValido(v: unknown): v is PerfilFiltro {
  return v === 'todos' || v === 'OPERADOR' || v === 'GERENTE'
}
