import { describe, expect, it } from 'vitest'
import { NotaManualSchema } from './actions.validation'

const nota = {
  emitente_nome: 'Fornecedor', emitente_cnpj: '12345678000199', numero_nf: '123',
  itens: [{ nome_produto: 'Tapete', q_com: 900, v_un_com: 10 }],
}

describe('nota manual gera obrigação financeira', () => {
  it('recusa nota sem parcelas no servidor', () => {
    expect(NotaManualSchema.safeParse(nota).success).toBe(false)
    expect(NotaManualSchema.safeParse({ ...nota, duplicatas: [] }).success).toBe(false)
  })
  it('aceita nota com parcela válida para contas a pagar', () => {
    const duplicatas = [{ data_vencimento: '2026-10-05', valor: 9000 }]
    expect(NotaManualSchema.safeParse({ ...nota, duplicatas }).success).toBe(true)
  })
})
