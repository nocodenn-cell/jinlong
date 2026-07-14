import type { ResultadoPreco } from '@core/pricing/types'
import {
  calcularPrecoCanonico,
  type PrecoAtacadoTierInput,
} from '@core/pricing/calcularPrecoCanonico'
import { resultadoPrecoFromCanonico } from '@core/pricing/resultadoPrecoFromCanonico'

/** Snapshot local dos inputs da PRICE_RESOLUTION_CHAIN. */
export type PrecoCanonicoSnapshot = {
  lojaId: string | null
  quantidadeMinimaAtacadoPadrao: number | null
  tiers: PrecoAtacadoTierInput[]
}

export type ProdutoPrecoCanonico = {
  id: string
  ativo: boolean
  preco_varejo: number
  preco_atacado: number | null
}

export function resolverPrecoCanonicoLocal(
  produto: ProdutoPrecoCanonico,
  quantidade: number,
  snap: PrecoCanonicoSnapshot,
): ResultadoPreco {
  const resolved = calcularPrecoCanonico({
    produtoId: produto.id,
    ativo: produto.ativo,
    precoVarejo: produto.preco_varejo,
    precoAtacado: produto.preco_atacado,
    quantidade,
    lojaId: snap.lojaId,
    quantidadeMinimaAtacadoPadrao: snap.quantidadeMinimaAtacadoPadrao,
    tiers: snap.tiers,
  })
  if (!resolved.ok) {
    return {
      precoUnitario: produto.preco_varejo,
      precoOriginal: produto.preco_varejo,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    }
  }
  return resultadoPrecoFromCanonico(resolved.result, produto.preco_varejo)
}

export function mapPrecoAtacadoRow(row: {
  id: string
  produto_id: string
  loja_id?: string | null
  quantidade_minima: number
  preco_unitario: number
  ativo?: boolean
}): PrecoAtacadoTierInput {
  return {
    id: row.id,
    produtoId: row.produto_id,
    lojaId: row.loja_id ?? null,
    quantidadeMinima: Number(row.quantidade_minima),
    precoUnitario: Number(row.preco_unitario),
    ativo: row.ativo !== false,
  }
}
