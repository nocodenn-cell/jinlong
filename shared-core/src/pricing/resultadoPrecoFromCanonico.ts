import type { ResultadoPreco } from './types'
import type { PriceResolutionResult } from './resolution'

/** Converte resolução canônica no shape do carrinho (preço automático). */
export function resultadoPrecoFromCanonico(
  resolution: PriceResolutionResult,
  precoVarejo: number,
): ResultadoPreco {
  const precoUnitario = Number(resolution.preco)
  const precoOriginal = Number(precoVarejo)
  return {
    precoUnitario,
    precoOriginal,
    descontoUnitario: Math.round((precoOriginal - precoUnitario) * 100) / 100,
    tipoPreco: resolution.tipo,
    quantidadeMinima: resolution.quantidadeMinima ?? null,
  }
}
