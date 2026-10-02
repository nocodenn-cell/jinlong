import { describe, expect, it } from 'vitest'
import { parseDevolverVendaForm } from './parseDevolverVendaForm'

const VENDA_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'

describe('parseDevolverVendaForm', () => {
  it('aceita payload válido de devolução parcial', () => {
    const fd = new FormData()
    fd.set('venda_id', VENDA_ID)
    fd.set('idempotency_key', KEY)
    fd.set('motivo', 'Defeito no produto')
    fd.set('tipo', 'DEVOLUCAO')
    fd.set('forma_estorno', 'PIX')
    fd.set('valor_estorno', '29.90')
    fd.set('itens_json', JSON.stringify([{ itemVendaId: ITEM_ID, quantidade: 1 }]))

    const parsed = parseDevolverVendaForm(fd)
    expect(parsed).toMatchObject({
      vendaId: VENDA_ID,
      tipo: 'DEVOLUCAO',
      valorEstorno: 29.9,
      itens: [{ itemVendaId: ITEM_ID, quantidade: 1 }],
    })
  })

  it('rejeita motivo curto', () => {
    const fd = new FormData()
    fd.set('venda_id', VENDA_ID)
    fd.set('idempotency_key', KEY)
    fd.set('motivo', 'x')
    fd.set('tipo', 'TROCA')
    fd.set('forma_estorno', 'DINHEIRO')
    fd.set('valor_estorno', '10')
    fd.set('itens_json', JSON.stringify([{ itemVendaId: ITEM_ID, quantidade: 1 }]))

    expect(parseDevolverVendaForm(fd)).toBeNull()
  })
})

describe('parseDevolverVendaForm — caixa pagador (PR-2D)', () => {
  const CAIXA_ID = '44444444-4444-4444-8444-444444444444'

  function baseForm(): FormData {
    const fd = new FormData()
    fd.set('venda_id', VENDA_ID)
    fd.set('idempotency_key', KEY)
    fd.set('motivo', 'Defeito no produto')
    fd.set('tipo', 'DEVOLUCAO')
    fd.set('forma_estorno', 'DINHEIRO')
    fd.set('valor_estorno', '50')
    fd.set('itens_json', JSON.stringify([{ itemVendaId: ITEM_ID, quantidade: 2 }]))
    return fd
  }

  it('caixa_id é opcional (o servidor usa o único caixa elegível)', () => {
    const parsed = parseDevolverVendaForm(baseForm())
    expect(parsed).not.toBeNull()
    expect(parsed?.caixaId).toBeUndefined()
  })

  it('repassa caixa_id válido', () => {
    const fd = baseForm()
    fd.set('caixa_id', CAIXA_ID)
    expect(parseDevolverVendaForm(fd)?.caixaId).toBe(CAIXA_ID)
  })

  it('rejeita caixa_id que não é UUID', () => {
    const fd = baseForm()
    fd.set('caixa_id', 'primeiro')
    expect(parseDevolverVendaForm(fd)).toBeNull()
  })
})
