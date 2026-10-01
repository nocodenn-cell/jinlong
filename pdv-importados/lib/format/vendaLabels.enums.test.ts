import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import {
  humanizarCodigo,
  labelFormaPagamentoVenda,
  labelStatusOperacional,
  labelStatusVenda,
  labelTipoMovimentoEstoque,
  labelTipoVenda,
  tipoMovimentoEstoqueLabels,
} from './vendaLabels'

const IDIOMAS = ['pt', 'zh'] as const

describe('dicionário único de rótulos de enums (UX-008)', () => {
  it.each(IDIOMAS)('forma de pagamento nunca expõe o código cru (%s)', (i) => {
    const m = getMessages(i)
    for (const c of ['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'CARTAO']) { // PIX é o próprio nome da forma
      const l = labelFormaPagamentoVenda(c, m)
      expect(l).not.toBe(c)
      expect(l).not.toMatch(/CARTAO_/)
    }
  })

  it.each(IDIOMAS)('tipo de venda COM_NF/SEM_NF traduzido (%s)', (i) => {
    const m = getMessages(i)
    expect(labelTipoVenda('COM_NF', m)).not.toContain('COM_NF')
    expect(labelTipoVenda('SEM_NF', m)).not.toContain('SEM_NF')
    expect(labelTipoVenda(null, m)).toBe('—')
  })

  it('tipo de venda em pt-BR', () => {
    const m = getMessages('pt')
    expect(labelTipoVenda('COM_NF', m)).toBe('Com nota fiscal')
    expect(labelTipoVenda('SEM_NF', m)).toBe('Sem nota fiscal')
  })

  it.each(IDIOMAS)('todos os códigos reais de movimento de estoque têm rótulo (%s)', (i) => {
    const m = getMessages(i)
    const reais = [
      'SAIDA_VENDA',
      'ENTRADA_DEVOLUCAO_CLIENTE',
      'ENTRADA_CANCELAMENTO_VENDA',
      'ENTRADA_NFE',
      'ENTRADA_OC',
      'ENTRADA_AJUSTE',
      'SAIDA_AJUSTE',
      'SAIDA_AVARIA',
      'TRANSFERENCIA_ENTRADA',
      'TRANSFERENCIA_SAIDA',
      'ENTRADA_REMESSA_LOJA',
      'PERDA',
      'QUEBRA',
    ]
    const mapa = tipoMovimentoEstoqueLabels(m)
    for (const c of reais) {
      expect(mapa[c], c).toBeTruthy()
      expect(labelTipoMovimentoEstoque(c, m), c).not.toMatch(/^[A-Z_]{4,}$/)
      expect(labelTipoMovimentoEstoque(c, m)).not.toContain('_')
    }
  })

  it('movimentos em pt-BR (acentos corretos, sem snake case)', () => {
    const m = getMessages('pt')
    expect(labelTipoMovimentoEstoque('SAIDA_VENDA', m)).toBe('Saída por venda')
    expect(labelTipoMovimentoEstoque('ENTRADA_DEVOLUCAO_CLIENTE', m)).toBe('Devolução de cliente')
    expect(labelTipoMovimentoEstoque('ENTRADA_REMESSA_LOJA', m)).toBe('Entrada de remessa')
  })

  it('código desconhecido vira texto legível, nunca o código cru', () => {
    expect(humanizarCodigo('ENTRADA_ALGO_NOVO')).toBe('Entrada algo novo')
    expect(labelTipoMovimentoEstoque('XPTO_QUALQUER', getMessages('pt'))).toBe('Xpto qualquer')
    expect(labelTipoMovimentoEstoque('', getMessages('pt'))).toBe('—')
  })

  it.each(IDIOMAS)('status operacional e de venda (%s)', (i) => {
    const m = getMessages(i)
    for (const c of ['CONCLUIDA', 'CANCELADA', 'PENDENTE', 'EMITIDO', 'ERRO', 'RASCUNHO']) {
      expect(labelStatusOperacional(c, m), c).not.toBe(c)
    }
    expect(labelStatusVenda('CONCLUIDA', m)).not.toBe('CONCLUIDA')
    expect(labelStatusOperacional('OUTRO_STATUS', m)).toBe('Outro status')
  })
})
