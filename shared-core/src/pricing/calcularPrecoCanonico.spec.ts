import { describe, expect, it } from 'vitest'
import {
  calcularPrecoCanonico,
  quantidadeParaCadeiaPreco,
  type PrecoAtacadoTierInput,
} from './calcularPrecoCanonico'

const TIERS: PrecoAtacadoTierInput[] = [
  {
    id: 't10',
    produtoId: 'p1',
    lojaId: null,
    quantidadeMinima: 10,
    precoUnitario: 80,
  },
  {
    id: 't50',
    produtoId: 'p1',
    lojaId: null,
    quantidadeMinima: 50,
    precoUnitario: 70,
  },
]

function base(over: Partial<Parameters<typeof calcularPrecoCanonico>[0]> = {}) {
  return calcularPrecoCanonico({
    produtoId: 'p1',
    ativo: true,
    precoVarejo: 100,
    precoAtacado: 85,
    quantidade: 1,
    lojaId: null,
    quantidadeMinimaAtacadoPadrao: 10,
    tiers: TIERS,
    ...over,
  })
}

describe('quantidadeParaCadeiaPreco', () => {
  it('floor com mínimo 1', () => {
    expect(quantidadeParaCadeiaPreco(1.9)).toBe(1)
    expect(quantidadeParaCadeiaPreco(10.1)).toBe(10)
    expect(quantidadeParaCadeiaPreco(0.5)).toBe(1)
    expect(quantidadeParaCadeiaPreco(0)).toBe(0)
  })
})

describe('calcularPrecoCanonico ≡ RPC 250', () => {
  it('varejo quando qty < min tier e < min padrao', () => {
    const r = base({ quantidade: 5 })
    expect(r).toEqual({
      ok: true,
      result: { preco: 100, tipo: 'VAREJO', fonte: 'varejo' },
    })
  })

  it('tier min10', () => {
    const r = base({ quantidade: 10 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.result).toMatchObject({
      preco: 80,
      tipo: 'ATACADO',
      fonte: 'tier',
      regraId: 't10',
    })
  })

  it('tier maior quantidade_minima vence', () => {
    const r = base({ quantidade: 50 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.result.preco).toBe(70)
    expect(r.result.regraId).toBe('t50')
  })

  it('fallback catálogo sem tiers aplicáveis', () => {
    const r = base({ quantidade: 12, tiers: [] })
    expect(r).toEqual({
      ok: true,
      result: { preco: 85, tipo: 'ATACADO', fonte: 'catalogo' },
    })
  })

  it('produto inativo → erro', () => {
    expect(base({ ativo: false }).ok).toBe(false)
  })

  it('qty fracionada 9.9 usa floor 9 → varejo', () => {
    const r = base({ quantidade: 9.9 })
    expect(r.ok && r.result.tipo).toBe('VAREJO')
  })

  it('tier da loja filtra; global (null) também aplica', () => {
    const loja = 'loja-a'
    const tiers: PrecoAtacadoTierInput[] = [
      {
        id: 'g',
        produtoId: 'p1',
        lojaId: null,
        quantidadeMinima: 5,
        precoUnitario: 90,
      },
      {
        id: 'l',
        produtoId: 'p1',
        lojaId: loja,
        quantidadeMinima: 5,
        precoUnitario: 75,
      },
      {
        id: 'other',
        produtoId: 'p1',
        lojaId: 'outra',
        quantidadeMinima: 5,
        precoUnitario: 60,
      },
    ]
    // Entre global 90 e loja-a 75, ambos qty 5: maior min empata — ORDER BY
    // quantidade_minima DESC só; desempate Postgres não é determinístico por
    // preço. Aqui ambos min=5; qualquer um com min=5 é aplicável — escolhemos
    // o último max min (empate: primeiro best permanece até maior min).
    // Com mins iguais o reduce fica com o primeiro encontrado (g) na ordem
    // do array — para paridade estrita com SQL sem tie-break, preferir mins
    // distintos. Caso de teste: loja-specific com min maior vence.
    const r = calcularPrecoCanonico({
      produtoId: 'p1',
      ativo: true,
      precoVarejo: 100,
      precoAtacado: null,
      quantidade: 10,
      lojaId: loja,
      quantidadeMinimaAtacadoPadrao: null,
      tiers: [
        ...tiers,
        {
          id: 'l2',
          produtoId: 'p1',
          lojaId: loja,
          quantidadeMinima: 10,
          precoUnitario: 70,
        },
      ],
    })
    expect(r.ok && r.result.regraId).toBe('l2')
    expect(r.ok && r.result.preco).toBe(70)
  })

  it('ignora tier de outra loja', () => {
    const r = base({
      quantidade: 20,
      lojaId: 'loja-a',
      tiers: [
        {
          id: 'x',
          produtoId: 'p1',
          lojaId: 'outra',
          quantidadeMinima: 1,
          precoUnitario: 50,
        },
      ],
      precoAtacado: null,
      quantidadeMinimaAtacadoPadrao: null,
    })
    expect(r.ok && r.result.fonte).toBe('varejo')
  })
})
