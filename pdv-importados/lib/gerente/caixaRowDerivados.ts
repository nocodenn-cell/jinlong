import { roundMoney2 } from '@/shared/cart/totals'

type CaixaLinha = {
  id: string
  valor_inicial: unknown
  valor_fechamento: unknown | null
  fechamento_diferenca: unknown | null
}

/**
 * Métricas derivadas repetidas na listagem de caixas (CSV + tabela).
 */
export function derivadosLinhaCaixaGerente(
  c: CaixaLinha,
  valorSistemaPorCaixa: Map<string, number>,
): {
  valorSistemaDinheiro: number
  valorFechamento: number | null
  diferenca: number | null
  temDivergencia: boolean
} {
  const valorSistemaBase = valorSistemaPorCaixa.get(c.id) ?? 0
  const valorSistemaDinheiro = roundMoney2(Number(c.valor_inicial ?? 0) + valorSistemaBase)
  const valorFechamento =
    c.valor_fechamento != null ? Number(c.valor_fechamento) : null
  const diferencaCalculada =
    valorFechamento != null ? roundMoney2(valorFechamento - valorSistemaDinheiro) : null
  const diferenca =
    c.fechamento_diferenca != null ? Number(c.fechamento_diferenca) : diferencaCalculada
  const temDivergencia = diferenca != null && Math.abs(diferenca) >= 0.01
  return { valorSistemaDinheiro, valorFechamento, diferenca, temDivergencia }
}
