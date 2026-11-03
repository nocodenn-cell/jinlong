/**
 * SSoT das unidades de medida de produto (`produtos.unidade_medida`).
 *
 * Fonte oficial da lista: o formulário de produto (`UnidadeCode` em
 * `pdv-importados/components/gerente/produtos/form/produtoForm.types.ts`) e o enum
 * do schema `produtoFormSchema.ts`. Este módulo define a regra de quantidade de
 * cada unidade; o banco não tem CHECK na coluna (ver PDV-100.1), então valores
 * fora da lista são tratados como UN (inteira) no cálculo.
 *
 * - UN, CX, FD: contagem inteira (unidade, caixa, fardo).
 * - KG, M: medida fracionável, até 3 casas (balança / metro), igual a `numeric(10,3)`.
 */
import { QUANTIDADE_CAIXA_MIN, quantidadeCaixaTemAte3Casas, roundQuantidadeCaixa3 } from './quantidadeCaixa'

export const UNIDADES_MEDIDA = ['UN', 'KG', 'CX', 'FD', 'M'] as const

export type UnidadeMedidaCode = (typeof UNIDADES_MEDIDA)[number]

const FRACIONAVEL: Record<UnidadeMedidaCode, boolean> = {
  UN: false,
  KG: true,
  CX: false,
  FD: false,
  M: true,
}

export function unidadeMedidaConhecida(valor: unknown): valor is UnidadeMedidaCode {
  return typeof valor === 'string' && (UNIDADES_MEDIDA as readonly string[]).includes(valor)
}

/** Normaliza o valor vindo do banco. Ausente ou desconhecido vira UN (regra conservadora: inteira). */
export function normalizarUnidadeMedida(valor: unknown): UnidadeMedidaCode {
  const limpo = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  return unidadeMedidaConhecida(limpo) ? limpo : 'UN'
}

export function unidadeAceitaFracao(unidade: UnidadeMedidaCode): boolean {
  return FRACIONAVEL[unidade]
}

/**
 * Quantidade permitida para a unidade do produto.
 * Inteira: deve ser inteiro >= 1. Fracionável: >= 0,001 e até 3 casas.
 */
export function quantidadeValidaParaUnidade(
  quantidade: number,
  unidade: UnidadeMedidaCode,
): boolean {
  if (!Number.isFinite(quantidade)) return false
  if (unidadeAceitaFracao(unidade)) {
    return quantidade >= QUANTIDADE_CAIXA_MIN && quantidadeCaixaTemAte3Casas(quantidade)
  }
  return Number.isInteger(quantidade) && quantidade >= 1
}

/**
 * Próxima quantidade ao usar +1 / −1 no carrinho. Em unidade inteira, uma quantidade
 * fracionada (ex.: 2,5 vindo de dado antigo) vai para o inteiro vizinho, nunca
 * para outro fracionário.
 */
export function ajustarQuantidadeUnidade(
  quantidade: number,
  unidade: UnidadeMedidaCode,
  delta: 1 | -1,
): number {
  if (unidadeAceitaFracao(unidade)) return roundQuantidadeCaixa3(quantidade + delta)
  return Math.floor(quantidade) + delta
}
