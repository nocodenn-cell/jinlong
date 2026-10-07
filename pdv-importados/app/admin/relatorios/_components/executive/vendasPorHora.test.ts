import { describe, expect, it } from 'vitest'
import { agruparVendasPorHora, picoDeVendas } from './vendasPorHora'

describe('agruparVendasPorHora', () => {
  it('ignora canceladas e soma por hora UTC quando sem timezone', () => {
    const buckets = agruparVendasPorHora([
      { data: '2026-10-07T14:30:00.000Z', total_liquido: 100, status: 'CONCLUIDA' },
      { data: '2026-10-07T14:45:00.000Z', total_liquido: 50, status: 'CONCLUIDA' },
      { data: '2026-10-07T14:00:00.000Z', total_liquido: 999, status: 'CANCELADA' },
      { data: '2026-10-07T09:00:00.000Z', total_liquido: 20, status: 'CONCLUIDA' },
    ])
    const h14 = buckets.find((b) => b.hour === new Date('2026-10-07T14:30:00.000Z').getHours())
    const h9 = buckets.find((b) => b.hour === new Date('2026-10-07T09:00:00.000Z').getHours())
    expect(h14?.total).toBe(150)
    expect(h14?.count).toBe(2)
    expect(h9?.total).toBe(20)
  })

  it('picoDeVendas retorna o bucket com maior total', () => {
    const buckets = agruparVendasPorHora([
      { data: '2026-10-07T10:00:00.000Z', total_liquido: 10, status: 'CONCLUIDA' },
      { data: '2026-10-07T18:00:00.000Z', total_liquido: 80, status: 'CONCLUIDA' },
    ])
    const pico = picoDeVendas(buckets)
    expect(pico?.total).toBe(80)
  })
})
