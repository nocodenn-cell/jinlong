import { describe, expect, it } from 'vitest'
import { ImportNfePayloadSchema, NotaManualSchema } from './actions.validation'

const nota = {
  emitente_nome: 'Fornecedor', emitente_cnpj: '12345678000199', numero_nf: '123',
  itens: [{ nome_produto: 'Tapete', q_com: 900, v_un_com: 10 }],
}
const duplicatas = [{ numero: '001', data_vencimento: '2026-10-05', valor: 9000 }]
const importacao = {
  ...nota, chave_acesso: '1'.repeat(44), origem_manual: true, atualizar_custo_padrao: false,
  linhas: nota.itens.map((item) => ({
    ...item, gtin: null, ref_fornecedor: 'T1', ncm: null, u_com: 'UN', fator: 1,
    atualizar_custo: false, acao: 'CRIAR', produto_id_destino: null,
  })), duplicatas,
}

describe('nota manual: proteção financeira no servidor', () => {
  it('recusa nota sem parcelas', () => {
    expect(NotaManualSchema.safeParse(nota).success).toBe(false)
    expect(NotaManualSchema.safeParse({ ...nota, duplicatas: [] }).success).toBe(false)
  })
  it('aceita parcelas iguais ao total dos produtos', () => {
    expect(NotaManualSchema.safeParse({ ...nota, duplicatas }).success).toBe(true)
    expect(ImportNfePayloadSchema.safeParse(importacao).success).toBe(true)
  })
  it.each([8999.99, 9000.01, 9400, 0, -1, Infinity, NaN, 9000.001])('recusa parcela divergente ou inválida: %s', (valor) => {
    const parcelas = [{ ...duplicatas[0], valor }]
    expect(NotaManualSchema.safeParse({ ...nota, duplicatas: parcelas }).success).toBe(false)
    expect(ImportNfePayloadSchema.safeParse({ ...importacao, duplicatas: parcelas }).success).toBe(false)
  })
  it.each([0, -1, Infinity, NaN])('recusa custo não positivo ou não finito: %s', (valor) => {
    const itens = [{ ...nota.itens[0], v_un_com: valor }]
    expect(NotaManualSchema.safeParse({ ...nota, itens, duplicatas }).success).toBe(false)
  })
  it('repete a proteção na importação mesmo sem indicador para chave MANUAL', () => {
    const payload = { ...importacao, origem_manual: false, chave_acesso: 'MANUAL' + '1'.repeat(38), duplicatas: [] }
    expect(ImportNfePayloadSchema.safeParse(payload).success).toBe(false)
  })
  it('preserva a importação XML, cujo total pode incluir valores externos aos itens', () => {
    expect(ImportNfePayloadSchema.safeParse({ ...importacao, origem_manual: false,
      duplicatas: [{ ...duplicatas[0], valor: 9400 }],
    }).success).toBe(true)
  })
  it('compara centavos e distribui três parcelas sem tolerar diferença de um centavo', () => {
    const itens = [{ ...nota.itens[0], q_com: 1, v_un_com: 100 }]
    const parcelas = [33.33, 33.33, 33.34].map((valor) => ({ ...duplicatas[0], valor }))
    expect(NotaManualSchema.safeParse({ ...nota, itens, duplicatas: parcelas }).success).toBe(true)
  })
  it('arredonda o total de cada item com quantidade fracionada', () => {
    const itens = [{ ...nota.itens[0], q_com: 1.5, v_un_com: 0.03 }]
    expect(NotaManualSchema.safeParse({ ...nota, itens,
      duplicatas: [{ ...duplicatas[0], valor: 0.05 }],
    }).success).toBe(true)
  })
})
