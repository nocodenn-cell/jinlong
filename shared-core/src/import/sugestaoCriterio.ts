/**
 * Critério de rateio SUGERIDO para uma despesa, a partir do tipo informado.
 * É só sugestão (o usuário revisa e justifica). Critérios = os do motor existente.
 * Observação: "igualitário" não existe no motor; o equivalente prático é QUANTIDADE_ESTOQUE.
 */
import type { CriterioRateio } from './types'

const REGRAS: ReadonlyArray<[RegExp, CriterioRateio, string]> = [
  [/frete|freight|运费|capatazia|thc|transporte/i, 'PESO_BRUTO', 'Frete/movimentação costuma variar com o peso bruto'],
  [/seguro|insurance|保险/i, 'VALOR_ADUANEIRO', 'Seguro é proporcional ao valor da mercadoria'],
  [/armazen|storage|仓储|demurrage|sobreestadia/i, 'VOLUME', 'Armazenagem/sobreestadia ocupa espaço (volume)'],
  [/etiqueta|rotulagem|label|贴标|unitiz/i, 'QUANTIDADE_ESTOQUE', 'Serviço por unidade'],
  [/despachante|honor|broker|报关|afrmm|siscomex|taxa/i, 'VALOR_ADUANEIRO', 'Taxas e honorários do processo: proporcional ao valor'],
]

export function sugerirCriterioRateio(tipoDespesa: string): { criterio: CriterioRateio; motivo: string } {
  for (const [re, criterio, motivo] of REGRAS) if (re.test(tipoDespesa)) return { criterio, motivo }
  return { criterio: 'VALOR_ADUANEIRO', motivo: 'Padrão: proporcional ao valor aduaneiro' }
}
