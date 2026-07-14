import type { ResultadoPreco } from '../pricing/types'

export type ItemCarrinho = {
  id: string
  produtoId: string
  quantidade: number
  precoVariejo: number
  precoUnitario: number
  precoOriginal: number
  nome: string
  categoriaId?: string
  resultado: ResultadoPreco
  /** Metadados PDV (referências de preço canônico, etc.). */
  metaPdv?: Record<string, unknown>
}
