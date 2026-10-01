/** @vitest-environment jsdom */
/**
 * Onda A — a lista de vendas tem UMA linha por venda (vendas.id), com o status ATUAL.
 * Uma venda cancelada nunca oferece "Cancelar" (antes: a linha SALE_REGISTERED do ledger ainda dizia CONCLUIDA).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { mapVendaRow, type RpcVendaRow } from '@/lib/vendas/vendasListaRpc'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/gerente/vendas/VendaCancelarModal', () => ({ VendaCancelarModal: () => null }))
vi.mock('@/app/gerente/vendas/VendaCancelamentoReciboModal', () => ({
  VendaCancelamentoReciboModal: () => null,
}))
vi.mock('./VendaDetailSheet', () => ({ VendaDetailSheet: () => null }))

import { VendasTable, type VendaLinha, type VendasLabels } from './VendasTable'

/** Cada chave devolve o próprio nome: basta para localizar botões/estados sem depender de i18n. */
const labels = new Proxy({} as VendasLabels, {
  get: (_t, key) => String(key),
})

/** Linhas como vêm de `listar_vendas_gerente`: 4 vendas distintas, 1 cancelada. */
const RPC_ROWS: RpcVendaRow[] = [
  { venda_id: 'aaaaaaaa-0000-4000-8000-000000000004', status: 'CANCELADA', data: '2026-09-30T16:00:00Z', total_liquido: '129.90', total_bruto: '129.90', forma_pagamento: 'DINHEIRO', caixa_id: 'c1', operador_id: 'o1', qtd_itens_total: '1', qtd_itens_distintos: 1, primeiro_produto: 'Cabo' },
  { venda_id: 'aaaaaaaa-0000-4000-8000-000000000003', status: 'CONCLUIDA', data: '2026-09-30T15:00:00Z', total_liquido: '130.00', total_bruto: '130.00', forma_pagamento: 'PIX', caixa_id: 'c1', operador_id: 'o1', qtd_itens_total: '2', qtd_itens_distintos: 2, primeiro_produto: 'Fone' },
  { venda_id: 'aaaaaaaa-0000-4000-8000-000000000002', status: 'CONCLUIDA', data: '2026-09-30T14:00:00Z', total_liquido: '123.90', total_bruto: '123.90', forma_pagamento: 'DINHEIRO', caixa_id: 'c1', operador_id: 'o1', qtd_itens_total: '1', qtd_itens_distintos: 1, primeiro_produto: 'Case' },
  { venda_id: 'aaaaaaaa-0000-4000-8000-000000000001', status: 'CONCLUIDA', data: '2026-09-30T13:00:00Z', total_liquido: '100.00', total_bruto: '100.00', forma_pagamento: 'PIX', caixa_id: 'c1', operador_id: 'o1', qtd_itens_total: '5', qtd_itens_distintos: 2, primeiro_produto: 'Carregador' },
]

function linhas(): VendaLinha[] {
  return RPC_ROWS.map(mapVendaRow).map((v) => ({ ...v, vendedor_nome: 'Ana' }))
}

describe('VendasTable — uma linha por venda (Onda A)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    flushSync(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  function render() {
    flushSync(() => {
      root.render(
        <VendasTable vendas={linhas()} labels={labels} m={getMessages('pt')} locale="pt-BR" />,
      )
    })
  }

  it('renderiza 4 linhas para 4 vendas distintas (nenhuma duplicada por evento)', () => {
    render()
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(4)
    const ids = new Set(Array.from(container.querySelectorAll('tbody tr span[title]')).map((e) => e.getAttribute('title')))
    expect(ids.size).toBe(4)
  })

  it('o status exibido é o ATUAL: 3 concluídas e 1 cancelada', () => {
    render()
    const text = container.textContent ?? ''
    expect(text.match(/concluida/g)?.length).toBe(3)
    expect(text.match(/cancelada/g)?.length).toBe(1)
  })

  it('a venda cancelada NÃO oferece "Cancelar"; as 3 concluídas oferecem', () => {
    render()
    const botoes = Array.from(container.querySelectorAll('button[aria-label^="cancelarAcao"]'))
    expect(botoes).toHaveLength(3)
    expect(botoes.some((b) => b.getAttribute('aria-label')?.includes('aaaaaaaa'))).toBe(true)
    // a linha cancelada (…0004) não tem o botão
    const linhaCancelada = Array.from(container.querySelectorAll('tbody tr')).find((tr) =>
      tr.querySelector('span[title="aaaaaaaa-0000-4000-8000-000000000004"]'),
    )
    expect(linhaCancelada).toBeTruthy()
    expect(linhaCancelada!.querySelector('button[aria-label^="cancelarAcao"]')).toBeNull()
  })
})
