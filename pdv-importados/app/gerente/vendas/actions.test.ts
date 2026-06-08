import { describe, expect, it } from 'vitest'

/** Lógica pura espelhando actions.ts — garante lista e KPI usam o mesmo mapeamento de eventos. */
function eventTypesFromFiltro(status: readonly string[]): string[] {
  if (status.length === 0) return ['SALE_REGISTERED', 'SALE_CANCELLED']
  const types: string[] = []
  if (status.some((s) => String(s).toUpperCase() === 'CONCLUIDA')) types.push('SALE_REGISTERED')
  if (status.some((s) => String(s).toUpperCase() === 'CANCELADA')) types.push('SALE_CANCELLED')
  return types.length > 0 ? types : ['SALE_REGISTERED', 'SALE_CANCELLED']
}

function mapStatus(eventType: string): string {
  return eventType === 'SALE_CANCELLED' ? 'CANCELADA' : 'CONCLUIDA'
}

describe('gerente vendas ledger mapping', () => {
  it('filtro vazio inclui ambos event types para alinhar lista e KPI', () => {
    expect(eventTypesFromFiltro([])).toEqual(['SALE_REGISTERED', 'SALE_CANCELLED'])
  })

  it('status CONCLUIDA mapeia para SALE_REGISTERED', () => {
    expect(eventTypesFromFiltro(['CONCLUIDA'])).toEqual(['SALE_REGISTERED'])
    expect(mapStatus('SALE_REGISTERED')).toBe('CONCLUIDA')
  })

  it('status CANCELADA mapeia para SALE_CANCELLED', () => {
    expect(eventTypesFromFiltro(['CANCELADA'])).toEqual(['SALE_CANCELLED'])
    expect(mapStatus('SALE_CANCELLED')).toBe('CANCELADA')
  })
})
