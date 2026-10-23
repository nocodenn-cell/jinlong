import { describe, expect, it } from 'vitest'
import { detalheComNomes, erroEntradaLegivel } from './mensagensMotor'

const ID = '5f0c2a1e-1111-4222-8333-444455556666'
const itens = [{ id: ID, descricao: 'Caixa de som BT' }]

describe('CALC-001.1 / P5 — mensagens do motor com nome do item', () => {
  it('qtd × fator inconsistente → chave própria e nome do item (não o UUID)', () => {
    expect(erroEntradaLegivel(`LANDED_QTD_FATOR_INCONSISTENTE: ${ID}`, itens)).toEqual({
      erro: 'erro_qtd_fator',
      detalhe: '"Caixa de som BT"',
    })
  })
  it('outros códigos mantêm a chave genérica, mas também sem UUID', () => {
    expect(erroEntradaLegivel(`LANDED_QTD_INVALIDA: ${ID}`, itens)).toEqual({
      erro: 'erro_entrada_invalida',
      detalhe: 'LANDED_QTD_INVALIDA: "Caixa de som BT"',
    })
  })
  it('id desconhecido permanece (nada é inventado); maiúsculas também casam', () => {
    expect(detalheComNomes('x 00000000-0000-4000-8000-000000000000', itens)).toBe('x 00000000-0000-4000-8000-000000000000')
    expect(detalheComNomes(ID.toUpperCase(), itens)).toBe('"Caixa de som BT"')
  })
  it('sem detalhe → chave genérica', () => {
    expect(erroEntradaLegivel(undefined, itens)).toEqual({ erro: 'erro_entrada_invalida' })
  })
})
