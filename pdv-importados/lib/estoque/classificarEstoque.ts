/**
 * Classificação de estoque para APRESENTAÇÃO (UX-006).
 *
 * A regra do banco (view `v_estoque_baixo` e RPC `gerente_estoque_list_page` com `visao='critico'`) é
 * `quantidade_atual <= estoque_minimo`. Isso mistura três situações bem diferentes, e produtos sem mínimo
 * cadastrado (mínimo 0) com saldo 0 entram como "baixo". Esta função só dá nome a cada situação — não
 * muda quem entra no alerta, então contagens do Dashboard, badge da sidebar e filtro do Estoque seguem
 * batendo entre si.
 */
export type EstoqueSituacao = 'ZERADO' | 'ABAIXO_MINIMO' | 'NO_MINIMO' | 'OK'

export function classificarEstoque(
  saldo: number | null | undefined,
  minimo: number | null | undefined,
): EstoqueSituacao {
  const s = Number(saldo ?? 0)
  const min = Number(minimo ?? 0)
  if (!Number.isFinite(s)) return 'OK'
  if (s <= 0) return 'ZERADO'
  if (min > 0 && s < min) return 'ABAIXO_MINIMO'
  if (min > 0 && s === min) return 'NO_MINIMO'
  return 'OK'
}

export type ContagemEstoque = Readonly<{
  zerados: number
  abaixoMinimo: number
  noMinimo: number
}>

/** Conta as situações de alerta em linhas da view `v_estoque_baixo` (saldo/mínimo). */
export function contarSituacoesEstoque(
  linhas: ReadonlyArray<{ quantidade_atual: number | null; estoque_minimo: number | null }>,
): ContagemEstoque {
  let zerados = 0
  let abaixoMinimo = 0
  let noMinimo = 0
  for (const l of linhas) {
    const s = classificarEstoque(l.quantidade_atual, l.estoque_minimo)
    if (s === 'ZERADO') zerados += 1
    else if (s === 'ABAIXO_MINIMO') abaixoMinimo += 1
    else if (s === 'NO_MINIMO') noMinimo += 1
  }
  return { zerados, abaixoMinimo, noMinimo }
}
