import { describe, expect, it } from 'vitest'
import { formaPagamentoSchema, formaPagamentoValidacao } from './actions.validation'

describe('formas-pagamento.actions.validation', () => {
  it('rejeita código e descrição vazios', () => {
    const r = formaPagamentoValidacao({ codigo: ' ', descricao: ' ', tipo: 'PIX', ativo: true })
    expect(r.ok).toBe(false)
  })

  it('aceita dados válidos', () => {
    const r = formaPagamentoValidacao({ codigo: 'PIX', descricao: 'Pagamento via PIX', tipo: 'PIX', ativo: true })
    expect(r).toEqual({
      ok: true,
      value: {
        codigo: 'PIX',
        descricao: 'Pagamento via PIX',
        tipo: 'PIX',
        ativo: true,
      },
    })
  })

  it('schema restringe tipo ao enum', () => {
    const parsed = formaPagamentoSchema.parse({
      codigo: 'DIN',
      descricao: 'Dinheiro',
      tipo: 'DINHEIRO',
      ativo: true,
    })
    expect(parsed.tipo).toBe('DINHEIRO')
  })
})

