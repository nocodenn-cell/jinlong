/**
 * Faixa de entrada do atacado, derivada de `precos_atacado` (D0-01: única
 * autoridade de preço de atacado). Puro — sem I/O.
 *
 * Existe para que o Catálogo represente o atacado a partir das faixas que o
 * PDV realmente aplica, e não de `produtos.preco_atacado` /
 * `quantidade_gatilho_atacado` (colunas legado que o editor de faixas não
 * mantém sincronizadas).
 *
 * "Faixa de entrada" = a de MENOR `quantidade_minima`: é onde o atacado começa.
 * Não é "o menor preço": o schema não força preço decrescente por quantidade
 * (só exige preço da faixa < varejo), então menor quantidade e menor preço
 * podem ser faixas diferentes.
 */

export type FaixaAtacadoAtiva = {
  produto_id: string
  quantidade_minima: number | string | null
  preco_unitario: number | string | null
  /** `null` = faixa global; UUID = faixa específica de uma loja. */
  loja_id?: string | null
}

export type AtacadoResumo = {
  /** `quantidade_minima` da faixa de entrada. */
  quantidadeMinima: number
  /** `preco_unitario` da faixa de entrada. */
  precoUnitario: number
  /** Quantas faixas ativas existem além da de entrada (quantidades distintas). */
  faixasAdicionais: number
}

function positivo(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Agrupa faixas ATIVAS por produto e resume cada uma. Faixas de outra loja são
 * ignoradas; faixas com quantidade/preço inválidos também (nunca viram "entrada").
 * Produto sem nenhuma faixa aplicável não aparece no mapa.
 */
export function resumirFaixasAtacado(
  faixas: readonly FaixaAtacadoAtiva[],
  lojaId: string | null,
): Map<string, AtacadoResumo> {
  type Ponto = { quantidade: number; preco: number }
  const porProduto = new Map<string, Ponto[]>()

  for (const f of faixas) {
    if (f.loja_id != null && f.loja_id !== lojaId) continue
    const quantidade = positivo(f.quantidade_minima)
    const preco = positivo(f.preco_unitario)
    if (quantidade === null || preco === null) continue
    const lista = porProduto.get(f.produto_id) ?? []
    lista.push({ quantidade, preco })
    porProduto.set(f.produto_id, lista)
  }

  const out = new Map<string, AtacadoResumo>()
  for (const [produtoId, pontos] of porProduto) {
    // Menor quantidade primeiro; em empate de quantidade (faixa global e de loja
    // no mesmo limiar) o menor preço vence só para o resultado ser determinístico.
    pontos.sort((a, b) => a.quantidade - b.quantidade || a.preco - b.preco)
    const entrada = pontos[0]
    const quantidadesDistintas = new Set(pontos.map((p) => p.quantidade)).size
    out.set(produtoId, {
      quantidadeMinima: entrada.quantidade,
      precoUnitario: entrada.preco,
      faixasAdicionais: quantidadesDistintas - 1,
    })
  }
  return out
}
