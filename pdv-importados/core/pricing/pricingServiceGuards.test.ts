import { describe, expect, it } from 'vitest'
import { PricingService } from '@shared/pricing/PricingService'
import type { RegraPreco } from '@shared/pricing/types'

const svc = new PricingService()

function item(quantidade: number, preco: number) {
  return {
    id: 'i1',
    produtoId: 'p1',
    quantidade,
    precoOriginal: preco,
    precoUnitario: preco,
    precoVariejo: preco,
  } as never
}

describe('PricingService — somente PROMOCAO (Aut#1)', () => {
  it('ignora regras ATACADO (autoridade = calcularPrecoCanonico)', () => {
    const regra: RegraPreco = {
      id: 'r1',
      nome: 'ATACADO',
      tipo: 'ATACADO',
      minQuantidade: 1,
      descontoPercentual: 50,
      ativo: true,
    }
    const r = svc.calcularPrecoItem(item(5, 100), [regra], {})
    expect(r.tipoPreco).toBe('VAREJO')
    expect(r.precoUnitario).toBe(100)
  })

  it('não permite preço acima do original via precoFixo inválido em PROMOCAO', () => {
    const regra: RegraPreco = {
      id: 'r2',
      nome: 'PROMOCAO',
      tipo: 'PROMOCAO',
      precoFixo: 999,
      ativo: true,
    }
    const r = svc.calcularPrecoItem(item(1, 100), [regra], {})
    expect(r.precoUnitario).toBeLessThanOrEqual(100)
  })

  it('ignora regra vencida', () => {
    const regra: RegraPreco = {
      id: 'r3',
      nome: 'PROMOCAO',
      tipo: 'PROMOCAO',
      descontoPercentual: 50,
      dataValidade: '2000-01-01T00:00:00Z',
      ativo: true,
    }
    const r = svc.calcularPrecoItem(item(1, 100), [regra], {})
    expect(r.tipoPreco).toBe('VAREJO')
  })

  it('aplica PROMOCAO válida', () => {
    const regra: RegraPreco = {
      id: 'r4',
      nome: 'PROMOCAO',
      tipo: 'PROMOCAO',
      descontoPercentual: 50,
      ativo: true,
    }
    const r = svc.calcularPrecoItem(item(1, 100), [regra], {})
    expect(r.tipoPreco).toBe('PROMOCAO')
    expect(r.precoUnitario).toBe(50)
  })
})
