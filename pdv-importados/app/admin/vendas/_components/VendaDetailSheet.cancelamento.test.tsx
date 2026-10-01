/** @vitest-environment jsdom */
/** UX-019 / P-17 — venda cancelada mostra quem cancelou, quando, motivo e valor estornado no detalhe. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { VendaDetalhe } from '../actions'

const base: VendaDetalhe = {
  id: 'abcdef12-3456-4000-8000-000000000000',
  data: '2026-09-30T03:24:27Z',
  total_bruto: 50,
  total_desconto: 0,
  total_liquido: 50,
  forma_pagamento: 'DINHEIRO',
  tipo_venda: 'COM_NF',
  status: 'CANCELADA',
  numero_nf: null,
  operador_nome: 'Ana',
  cliente_nome: null,
  tem_conta_receber: false,
  valor_aberto_cr: 0,
  pagamentos: [],
  desconto_gerente_valor: 0,
  desconto_gerente_percentual: 0,
  itens: [],
  showMargemVisual: false,
  showPrecoFonte: false,
  cancelamento: { em: '2026-09-30T18:00:00Z', motivo: 'Cliente desistiu', operador_nome: 'Gerente Bia', valor_estornado: 50 },
}

let atual: VendaDetalhe = base
vi.mock('../actions', () => ({ obterDetalheVenda: vi.fn(async () => atual) }))
vi.mock('@/app/caixa/actions', () => ({ obterNomeLojaAtual: vi.fn(async () => ({ ok: true, nome: 'Loja' })) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/gerente/vendas/VendaCancelarModal', () => ({ VendaCancelarModal: () => null }))
vi.mock('@/app/gerente/vendas/VendaDevolucaoModal', () => ({ VendaDevolucaoModal: () => null }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { VendaDetailSheet } = await import('./VendaDetailSheet')

const labels = {
  titulo: 'Venda', erroTitulo: 'Erro', erroSub: '', data: 'Data', tipo: 'Tipo', operador: 'Operador', nfe: 'NF-e',
  cliente: 'Cliente', saldoAberto: 'Saldo', verFinanceiro: 'Financeiro', bruto: 'Bruto', desconto: 'Desconto',
  liquido: 'Líquido', itens: 'Itens', nenhumItem: 'Nenhum',
  cancelamentoTitulo: 'Cancelamento', canceladoEm: 'Cancelada em', canceladoPor: 'Cancelada por', motivo: 'Motivo', estornado: 'Valor estornado',
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function abrir(venda: VendaDetalhe) {
  atual = venda
  await act(async () => {
    root.render(<VendaDetailSheet alvo={{ id: venda.id } as never} onClose={() => {}} labels={labels} m={getMessages('pt')} locale="pt-BR" />)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('VendaDetailSheet — cancelamento (UX-019)', () => {
  it('venda cancelada: mostra data/hora do cancelamento (fuso de São Paulo), quem cancelou, motivo e valor estornado', async () => {
    await abrir(base)
    const bloco = document.querySelector('[data-testid="venda-cancelamento"]') as HTMLElement
    expect(bloco).toBeTruthy()
    const t = bloco.textContent ?? ''
    expect(t).toContain('Gerente Bia')
    expect(t).toContain('Cliente desistiu')
    expect(t).toContain('15:00:00') // 18:00Z = 15:00 em São Paulo
    expect(t).toContain('50,00')
    // tipo de venda legível (UX-008)
    expect(document.body.textContent).toContain('Com nota fiscal')
    expect(document.body.textContent).not.toContain('COM_NF')
  })

  it('venda concluída não mostra o bloco de cancelamento', async () => {
    await abrir({ ...base, status: 'CONCLUIDA', cancelamento: null })
    expect(document.querySelector('[data-testid="venda-cancelamento"]')).toBeNull()
  })

  it('cancelada sem registro de auditoria não quebra e não inventa dados', async () => {
    await abrir({ ...base, cancelamento: null })
    expect(document.querySelector('[data-testid="venda-cancelamento"]')).toBeNull()
  })
})
