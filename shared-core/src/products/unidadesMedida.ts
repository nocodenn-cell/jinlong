/**
 * Regra de fração por unidade de medida do produto (SSoT das quantidades).
 * UN, CX e FD são contáveis: quantidade inteira. KG e M são vendidos por peso
 * ou medida: aceitam fração com até 3 casas (ex.: 0,500 kg).
 */
export const UNIDADES_MEDIDA = ['UN', 'KG', 'CX', 'FD', 'M'] as const
export type UnidadeMedidaCodigo = (typeof UNIDADES_MEDIDA)[number]

export const UNIDADES_FRACIONADAS: readonly UnidadeMedidaCodigo[] = ['KG', 'M']

export function unidadeAceitaFracao(unidade: string | null | undefined): boolean {
  return UNIDADES_FRACIONADAS.includes(unidade as UnidadeMedidaCodigo)
}
