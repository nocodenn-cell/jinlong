import { describe, expect, it } from 'vitest'
import {
  calcularPrecoCanonico,
  type PrecoAtacadoTierInput,
} from '../../../shared-core/src/pricing/calcularPrecoCanonico'
import { resultadoPrecoFromCanonico } from '../../../shared-core/src/pricing/resultadoPrecoFromCanonico'

const TIER: PrecoAtacadoTierInput = {
  id: 'faixa-12',
  produtoId: 'p1',
  lojaId: null,
  quantidadeMinima: 12,
  precoUnitario: 8,
}

function resolver(quantidade: number, tiers: PrecoAtacadoTierInput[] = [TIER]) {
  return calcularPrecoCanonico({
    produtoId: 'p1',
    ativo: true,
    precoVarejo: 10,
    precoAtacado: null,
    quantidade,
    lojaId: null,
    quantidadeMinimaAtacadoPadrao: 6,
    tiers,
  })
}

describe('contrato varejo/atacado — quantidade e persistência do preço efetivo', () => {
  it('abaixo do mínimo permanece varejo e ignora o gatilho legado', () => {
    const r = resolver(11)
    expect(r.ok && r.result).toMatchObject({ preco: 10, tipo: 'VAREJO', fonte: 'varejo' })
    expect(r.ok && r.result.quantidadeMinima).toBeUndefined()
  })

  it('exatamente no mínimo aplica atacado e guarda o mínimo da faixa', () => {
    const r = resolver(12)
    expect(r.ok && r.result).toMatchObject({
      preco: 8,
      tipo: 'ATACADO',
      fonte: 'tier',
      regraId: 'faixa-12',
      quantidadeMinima: 12,
    })
  })

  it('acima do mínimo mantém o mesmo atacado', () => {
    const r = resolver(13)
    expect(r.ok && r.result.tipo).toBe('ATACADO')
    expect(r.ok && r.result.preco).toBe(8)
  })

  it('reduzir a quantidade devolve o varejo', () => {
    const alto = resolver(12)
    const baixo = resolver(11)
    expect(alto.ok && alto.result.tipo).toBe('ATACADO')
    expect(baixo.ok && baixo.result.tipo).toBe('VAREJO')
    expect(baixo.ok && baixo.result.preco).toBe(10)
  })

  it('produto sem faixa de atacado permanece varejo mesmo em quantidade alta', () => {
    const r = resolver(100, [])
    expect(r.ok && r.result).toMatchObject({ preco: 10, tipo: 'VAREJO', fonte: 'varejo' })
  })

  it('o preço persistível usa o varejo como referência e o unitário da faixa', () => {
    const r = resolver(12)
    if (!r.ok) throw new Error('resolução falhou')
    const linha = resultadoPrecoFromCanonico(r.result, 10)
    expect(linha).toMatchObject({
      precoUnitario: 8,
      precoOriginal: 10,
      descontoUnitario: 2,
      tipoPreco: 'ATACADO',
      quantidadeMinima: 12,
    })
  })
})
