/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { VendaCancelamentoReciboModal } from './VendaCancelamentoReciboModal'
import { VendaDevolucaoReciboModal } from './VendaDevolucaoReciboModal'

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

const cancelamento = {
  vendaId: 'abcdef12-0000',
  dataOriginal: '2026-08-27T12:00:00Z',
  dataCancelamento: new Date('2026-08-27T13:00:00Z'),
  itens: [{ nome: 'Produto X', quantidade: 1, precoUnitario: 10 }],
  totalLiquido: 10,
  formaPagamentoLabel: 'Dinheiro',
  motivo: 'Erro',
  operadorNome: 'Ana',
} as never

const devolucao = {
  operacaoId: 'op123456-0000',
  vendaId: 'abcdef12-0000',
  tipo: 'DEVOLUCAO',
  dataOperacao: new Date('2026-08-27T13:00:00Z'),
  itens: [],
  valorEstornado: 10,
  formaEstornoLabel: 'Dinheiro',
  motivo: 'Defeito',
  operadorNome: 'Ana',
} as never

describe.each(['pt', 'zh'] as const)('comprovantes de venda — %s', (idioma) => {
  const m = getMessages(idioma)
  const t = m.gerente.comprovante_venda
  const outro = getMessages(idioma === 'pt' ? 'zh' : 'pt').gerente.comprovante_venda

  it('cancelamento usa o catálogo do idioma (sem texto fixo em pt)', () => {
    act(() => {
      root.render(<VendaCancelamentoReciboModal comprovante={cancelamento} locale="pt-BR" m={m} onClose={() => {}} />)
    })
    const txt = container.textContent ?? ''
    expect(txt).toContain(t.venda_cancelada)
    expect(txt).toContain(t.total_estornado)
    expect(txt).toContain(m.caixa.recibo.rodape_nao_fiscal)
    expect(txt).toContain(m.caixa.btn_imprimir_comprovante)
    expect(txt).not.toContain(outro.venda_cancelada)
  })

  it('devolução usa o catálogo do idioma', () => {
    act(() => {
      root.render(<VendaDevolucaoReciboModal comprovante={devolucao} locale="pt-BR" m={m} onClose={() => {}} />)
    })
    const txt = container.textContent ?? ''
    expect(txt).toContain(t.devolucao_titulo)
    expect(txt).toContain(t.forma_estorno)
    expect(txt).toContain(m.caixa.recibo.rodape_nao_fiscal)
    expect(txt).not.toContain(outro.devolucao_titulo)
  })
})
