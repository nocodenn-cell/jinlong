/**
 * Espelho TS da precedência de regras de comissão (SQL: internal.comissao_regra_nivel / comissao_regra_empresa).
 * Usado na tela para explicar a prévia; o cálculo que vale é sempre o do banco.
 */
export type RegraComissao = {
  id: string
  lojaId: string | null
  usuarioId: string | null
  cargo: string | null
  produtoId: string | null
  categoriaId: string | null
  canal: 'VAREJO' | 'ATACADO' | null
  tipoCalculo: 'percentual' | 'fixo'
  valor: number
  vigenciaInicio: string // YYYY-MM-DD
  vigenciaFim: string | null
  ativo: boolean
}

export function nivelRegra(r: Pick<RegraComissao, 'usuarioId' | 'cargo' | 'produtoId' | 'categoriaId'>): number {
  const alvo = r.produtoId ? 0 : r.categoriaId ? 1 : 2
  if (r.usuarioId) return 1 + alvo
  if (r.cargo) return 4 + alvo
  return r.produtoId ? 7 : r.categoriaId ? 8 : 9
}

export function normalizarCargo(c: string | null | undefined): string | null {
  const v = (c ?? '').trim().toLowerCase()
  return v ? v : null
}

export type ContextoRegra = {
  lojaId: string
  vendedorId: string
  cargo: string | null
  produtoId: string
  categoriaId: string | null
  canal: 'VAREJO' | 'ATACADO'
  data: string // YYYY-MM-DD
}

/** Regra vencedora: menor nível; canal informado; loja informada; vigência mais recente; id. */
export function escolherRegra(regras: RegraComissao[], c: ContextoRegra): RegraComissao | null {
  const cargo = normalizarCargo(c.cargo)
  const cand = regras.filter(
    (r) =>
      r.ativo &&
      (r.lojaId === null || r.lojaId === c.lojaId) &&
      r.vigenciaInicio <= c.data &&
      (r.vigenciaFim === null || r.vigenciaFim >= c.data) &&
      (r.usuarioId === null || r.usuarioId === c.vendedorId) &&
      (r.cargo === null || r.cargo === cargo) &&
      (r.produtoId === null || r.produtoId === c.produtoId) &&
      (r.categoriaId === null || r.categoriaId === c.categoriaId) &&
      (r.canal === null || r.canal === c.canal),
  )
  cand.sort(
    (a, b) =>
      nivelRegra(a) - nivelRegra(b) ||
      Number(b.canal !== null) - Number(a.canal !== null) ||
      Number(b.lojaId !== null) - Number(a.lojaId !== null) ||
      (a.vigenciaInicio < b.vigenciaInicio ? 1 : a.vigenciaInicio > b.vigenciaInicio ? -1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return cand[0] ?? null
}
