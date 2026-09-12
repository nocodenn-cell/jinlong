import { describe, expect, it } from 'vitest'
import { efeitosConfirmacaoNfe } from './ImportarNfePageClient'
import { somaParcelas } from './ParcelasNfeSection'

const LABELS = {
  estoque: '{{n}} item(ns) entram no estoque.',
  custo: 'Custo atualizado.',
  financeiro: '{{n}} parcela(s), somando {{total}}, entram em Contas a pagar.',
  financeiroZero: 'Nenhuma conta a pagar será gerada.',
  irreversivel: 'Não pode ser desfeito por esta tela.',
} as const

const base = {
  itens: 3,
  parcelas: 2,
  totalParcelas: 'R$ 1.200,00',
  atualizaCusto: false,
  labels: LABELS,
} as const

describe('efeitosConfirmacaoNfe', () => {
  it('declara estoque, financeiro e irreversibilidade', () => {
    const efeitos = efeitosConfirmacaoNfe(base)

    expect(efeitos.map((e) => e.tom)).toEqual(['estoque', 'financeiro', 'alerta'])
    expect(efeitos[0].texto).toBe('3 item(ns) entram no estoque.')
    expect(efeitos[1].texto).toBe(
      '2 parcela(s), somando R$ 1.200,00, entram em Contas a pagar.',
    )
  })

  it('inclui o efeito de custo só quando algum item atualiza custo', () => {
    const semCusto = efeitosConfirmacaoNfe(base)
    const comCusto = efeitosConfirmacaoNfe({ ...base, atualizaCusto: true })

    expect(semCusto.some((e) => e.texto === LABELS.custo)).toBe(false)
    expect(comCusto.some((e) => e.texto === LABELS.custo)).toBe(true)
  })

  it('nota sem parcelas diz que nenhuma conta a pagar nasce — não omite o efeito', () => {
    const efeitos = efeitosConfirmacaoNfe({ ...base, parcelas: 0, totalParcelas: 'R$ 0,00' })
    const financeiro = efeitos.find((e) => e.tom === 'financeiro')

    expect(financeiro?.texto).toBe(LABELS.financeiroZero)
  })
})

describe('somaParcelas', () => {
  it('soma os valores das parcelas da nota', () => {
    const total = somaParcelas([
      { id: 'a', numero: '001', data_vencimento: '2026-10-20', valor: 450.5 },
      { id: 'b', numero: '002', data_vencimento: '2026-11-20', valor: 749.5 },
    ])

    expect(total).toBe(1200)
  })

  it('nota sem parcelas soma zero', () => {
    expect(somaParcelas([])).toBe(0)
  })
})
