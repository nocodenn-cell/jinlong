import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { mensagemVendaOk } from './caixaMensagemVendaOk'

const VENDA_ID = '9f8e7d6c-1111-2222-3333-444455556666'

describe('mensagemVendaOk (E12 — título a receber gerado na venda)', () => {
  it('sem título a receber: mantém a mensagem de sempre', () => {
    const m = getMessages('pt').caixa
    const msg = mensagemVendaOk(m, { vendaId: VENDA_ID, saldoAReceber: '0,00' })
    expect(msg).toBe('Venda registrada (id 9f8e7d6c…). Estoque atualizado.')
    expect(msg).not.toContain('Conta a receber')
  })

  it('contasRecebeId vazio/nulo também não cita título', () => {
    const m = getMessages('pt').caixa
    expect(mensagemVendaOk(m, { vendaId: VENDA_ID, contasRecebeId: null, saldoAReceber: '10,00' })).not.toContain(
      'Conta a receber',
    )
    expect(mensagemVendaOk(m, { vendaId: VENDA_ID, contasRecebeId: '', saldoAReceber: '10,00' })).not.toContain(
      'Conta a receber',
    )
  })

  it('com título gerado: cita valor a receber e cliente', () => {
    const m = getMessages('pt').caixa
    const msg = mensagemVendaOk(m, {
      vendaId: VENDA_ID,
      contasRecebeId: 'cr-1',
      saldoAReceber: '35,50',
      clienteNome: 'Maria Souza',
    })
    expect(msg).toContain('id 9f8e7d6c…')
    expect(msg).toContain('Conta a receber gerada: R$ 35,50 — Maria Souza')
  })

  it('cliente sem nome disponível: usa travessão em vez de "undefined"/vazio', () => {
    const m = getMessages('pt').caixa
    const msg = mensagemVendaOk(m, { vendaId: VENDA_ID, contasRecebeId: 'cr-1', saldoAReceber: '5,00', clienteNome: '  ' })
    expect(msg).toContain('R$ 5,00 — —')
    expect(msg).not.toContain('undefined')
  })

  it('zh: mesma informação, e nenhuma variável fica sem substituir', () => {
    const m = getMessages('zh').caixa
    const msg = mensagemVendaOk(m, {
      vendaId: VENDA_ID,
      contasRecebeId: 'cr-1',
      saldoAReceber: '35,50',
      clienteNome: 'Maria Souza',
    })
    expect(msg).toContain('35,50')
    expect(msg).toContain('Maria Souza')
    expect(msg).not.toContain('{{')
  })

  it('paridade pt/zh da nova chave', () => {
    expect(getMessages('pt').caixa.msg_venda_ok_com_titulo).toBeTruthy()
    expect(getMessages('zh').caixa.msg_venda_ok_com_titulo).toBeTruthy()
  })
})
