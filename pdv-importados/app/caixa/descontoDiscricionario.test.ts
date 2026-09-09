import { describe, expect, it } from 'vitest'
import {
  descontoDiscricionarioFromItens,
  totaisFromItens,
  type ItemTotalizacaoServidor,
} from '@/app/caixa/finalizarVendaValidation'

/**
 * Alçada de desconto do operador (`desconto_maximo_operador_percentual`).
 *
 * Regra de produto: preço de atacado é regra comercial previamente cadastrada e
 * revalidada no servidor contra `calcular_preco_produto`; NÃO é desconto
 * concedido no balcão e não consome a alçada. Desconto manual consome.
 *
 * Antes desta separação, a diferença varejo→atacado entrava no cômputo e uma
 * faixa de 20,4% (R$ 22,50 → R$ 17,90) fazia TODA venda de atacado ser recusada
 * com "ultrapassa o máximo permitido sem validação de gerente (10%)".
 */

type Linha = ItemTotalizacaoServidor & { tipoPreco: string }

const item = (over: Partial<Linha> = {}): Linha => ({
  precoOriginal: 22.5,
  precoUnitario: 22.5,
  quantidade: 1,
  tipoPreco: 'VAREJO',
  ...over,
})

/** Espelha o gate de `caixaVendas.impl.ts`: % sobre o bruto da venda. */
function pctAlcada(itens: Linha[]): number {
  const { totalBruto } = totaisFromItens(itens)
  if (totalBruto <= 0) return 0
  return (descontoDiscricionarioFromItens(itens) / totalBruto) * 100
}

const TETO = 10

describe('alçada de desconto do operador', () => {
  it('1. varejo normal — nada consome a alçada', () => {
    const itens = [item({ quantidade: 3 })]
    expect(descontoDiscricionarioFromItens(itens)).toBe(0)
    expect(pctAlcada(itens)).toBe(0)
  })

  it('2. atacado automático — faixa aplicada não consome a alçada', () => {
    const itens = [item({ tipoPreco: 'ATACADO', precoUnitario: 17.9, quantidade: 3 })]
    expect(totaisFromItens(itens).totalDesconto).toBe(13.8)
    expect(descontoDiscricionarioFromItens(itens)).toBe(0)
  })

  it('3. atacado com desconto > 10% NÃO exige gerente só pela faixa', () => {
    const itens = [item({ tipoPreco: 'ATACADO', precoUnitario: 17.9, quantidade: 3 })]
    const t = totaisFromItens(itens)
    // O desconto total da venda é 20,4% — acima do teto.
    expect((t.totalDesconto / t.totalBruto) * 100).toBeCloseTo(20.44, 1)
    // Mas nada disso é discricionário, então a alçada não é tocada.
    expect(pctAlcada(itens)).toBe(0)
    expect(pctAlcada(itens) > TETO).toBe(false)
  })

  it('4. desconto manual dentro do limite passa', () => {
    // 5% de R$ 100,00
    const itens = [item({ tipoPreco: 'MANUAL', precoOriginal: 100, precoUnitario: 95 })]
    expect(descontoDiscricionarioFromItens(itens)).toBe(5)
    expect(pctAlcada(itens)).toBeCloseTo(5, 6)
    expect(pctAlcada(itens) > TETO).toBe(false)
  })

  it('5. desconto manual acima do limite continua exigindo autorização', () => {
    // 20% de R$ 100,00
    const itens = [item({ tipoPreco: 'MANUAL', precoOriginal: 100, precoUnitario: 80 })]
    expect(descontoDiscricionarioFromItens(itens)).toBe(20)
    expect(pctAlcada(itens) > TETO).toBe(true)
  })

  it('6. atacado + manual: a faixa não abre espaço para o manual estourar o teto', () => {
    // Linha de atacado grande (desconto de regra, não conta) + manual de 20%
    // sobre uma linha de R$ 100,00. O bruto cresce, mas o manual segue medido
    // pelo mesmo denominador do gate — e ainda assim não pode ser diluído a
    // ponto de o teto deixar de valer quando o manual é o excesso real.
    const atacado = item({ tipoPreco: 'ATACADO', precoUnitario: 17.9, quantidade: 3 })
    const manual = item({ tipoPreco: 'MANUAL', precoOriginal: 100, precoUnitario: 80 })

    // Isolado, o manual estoura.
    expect(pctAlcada([manual]) > TETO).toBe(true)

    // Somado ao atacado, o desconto discricionário continua sendo só o manual.
    const juntos = [atacado, manual]
    expect(descontoDiscricionarioFromItens(juntos)).toBe(20)
    // E o total da venda NÃO é usado para "esconder" o manual: o valor
    // discricionário absoluto é preservado integralmente.
    expect(descontoDiscricionarioFromItens(juntos)).toBe(
      descontoDiscricionarioFromItens([manual]),
    )
  })

  it('promoção também é discricionária', () => {
    const itens = [item({ tipoPreco: 'PROMOCAO', precoOriginal: 100, precoUnitario: 70 })]
    expect(descontoDiscricionarioFromItens(itens)).toBe(30)
  })

  it('acréscimo (preço acima do original) nunca vira desconto negativo', () => {
    const itens = [item({ tipoPreco: 'MANUAL', precoOriginal: 100, precoUnitario: 110 })]
    expect(descontoDiscricionarioFromItens(itens)).toBe(0)
  })
})
