import { roundMoney2 } from '@core/pdv/invariants/money'

export type ModalidadePrecoLinha = 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'

const ROTULO_PT: Record<ModalidadePrecoLinha, string> = {
  VAREJO: 'Varejo',
  ATACADO: 'Atacado',
  MANUAL: 'Manual',
  PROMOCAO: 'Promoção',
}

export type ApresentacaoPrecoLinha = {
  unitario: number
  original: number
  subtotal: number
  descontoLinha: number
  exibeReferencia: boolean
  modalidade: ModalidadePrecoLinha
  rotulo: string
  quantidadeMinima: number | null
}

function modalidadeDe(tipo: string | undefined): ModalidadePrecoLinha {
  if (tipo === 'ATACADO' || tipo === 'MANUAL' || tipo === 'PROMOCAO') return tipo
  return 'VAREJO'
}

/** Preço que o operador vê na linha — o unitário efetivo, não só a referência. */
export function apresentacaoPrecoLinha(item: {
  quantidade: number
  resultado?: {
    precoUnitario: number
    precoOriginal: number
    tipoPreco?: string
    quantidadeMinima?: number | null
  }
}): ApresentacaoPrecoLinha {
  const unitario = roundMoney2(item.resultado?.precoUnitario ?? 0)
  const original = roundMoney2(item.resultado?.precoOriginal ?? unitario)
  const subtotal = roundMoney2(unitario * item.quantidade)
  const descontoUnit = roundMoney2(original - unitario)
  const exibeReferencia = descontoUnit > 0
  const modalidade = modalidadeDe(item.resultado?.tipoPreco)
  const minima = item.resultado?.quantidadeMinima
  return {
    unitario,
    original,
    subtotal,
    descontoLinha: exibeReferencia ? roundMoney2(descontoUnit * item.quantidade) : 0,
    exibeReferencia,
    modalidade,
    rotulo: ROTULO_PT[modalidade],
    quantidadeMinima: typeof minima === 'number' && Number.isFinite(minima) ? minima : null,
  }
}
