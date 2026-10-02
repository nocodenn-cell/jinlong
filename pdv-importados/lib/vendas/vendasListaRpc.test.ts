import { describe, expect, it } from 'vitest'
import { mapVendaRow, statusFromFiltro, type RpcVendaRow } from './vendasListaRpc'

const base: RpcVendaRow = {
  venda_id: 'abc',
  status: 'CANCELADA',
  data: '2026-09-30T16:00:00Z',
  total_liquido: '129.90',
  total_bruto: '129.90',
  forma_pagamento: 'DINHEIRO',
  caixa_id: 'c1',
  operador_id: null,
  qtd_itens_total: '3',
  qtd_itens_distintos: 2,
  primeiro_produto: 'Cabo',
}

describe('vendasListaRpc', () => {
  it('o status vem de vendas.status (estado atual), a identidade é venda_id', () => {
    const row = mapVendaRow(base)
    expect(row.id).toBe('abc')
    expect(row.status).toBe('CANCELADA')
    expect(row.total_liquido).toBe(129.9)
    expect(row.qtd_itens_total).toBe(3)
    expect(row.operador_id).toBeNull()
  })

  it('valores ausentes não viram NaN', () => {
    const row = mapVendaRow({ ...base, total_liquido: null, total_bruto: null, qtd_itens_total: null, qtd_itens_distintos: null })
    expect(row.total_liquido).toBeNull()
    expect(row.total_bruto).toBeNull()
    expect(row.qtd_itens_total).toBe(0)
    expect(row.qtd_itens_distintos).toBe(0)
  })

  it('filtro de status: vazio = todas; ignora valores inválidos; normaliza caixa', () => {
    expect(statusFromFiltro([])).toBeNull()
    expect(statusFromFiltro(['xpto'])).toBeNull()
    expect(statusFromFiltro(['cancelada'])).toEqual(['CANCELADA'])
    expect(statusFromFiltro(['CONCLUIDA', 'CANCELADA'])).toEqual(['CONCLUIDA', 'CANCELADA'])
  })
})
