import { describe, expect, it } from 'vitest'
import {
  diferencaAjuste,
  previaAjuste,
  previaRetirada,
  saldoAposRetirada,
  validarRetirada,
} from './ajusteSaldoHelpers'
import { montarObservacaoComDoc, separarDocObservacao } from './ajusteObservacaoDoc'

describe('previaAjuste / previaRetirada', () => {
  it('queda, aumento, sem alteração', () => {
    expect(previaAjuste(9, 5)).toBe('Saldo: 9 → 5 (−4)')
    expect(previaAjuste(5, 12)).toBe('Saldo: 5 → 12 (+7)')
    expect(previaAjuste(5, 5)).toBe('Saldo: 5 (sem alteração)')
    expect(previaAjuste(5, null)).toBe('Saldo atual: 5')
  })

  it('retirada 10→7 e 10→0', () => {
    expect(previaRetirada(10, 3)).toBe('Saldo: 10 → 7 (−3)')
    expect(saldoAposRetirada(10, 10)).toBe(0)
    expect(previaRetirada(10, 10)).toBe('Saldo: 10 → 0 (−10)')
  })
})

describe('validarRetirada', () => {
  it('bloqueia vazio, zero, NaN e acima do saldo', () => {
    expect(validarRetirada(10, '')).toEqual({ ok: false, erro: 'vazio' })
    expect(validarRetirada(10, '0')).toEqual({ ok: false, erro: 'invalido' })
    expect(validarRetirada(10, 'abc')).toEqual({ ok: false, erro: 'invalido' })
    expect(validarRetirada(10, '11')).toEqual({ ok: false, erro: 'excede' })
  })

  it('aceita retirada parcial e total', () => {
    expect(validarRetirada(10, '3')).toEqual({ ok: true, qtd: 3, novoSaldo: 7 })
    expect(validarRetirada(10, '10')).toEqual({ ok: true, qtd: 10, novoSaldo: 0 })
  })
})

describe('diferencaAjuste', () => {
  it('sistema 10 → contagem 7/13/10', () => {
    expect(diferencaAjuste(10, 7)).toBe(-3)
    expect(diferencaAjuste(10, 13)).toBe(3)
    expect(diferencaAjuste(10, 10)).toBe(0)
  })
})

describe('montarObservacaoComDoc', () => {
  it('não duplica [Doc:] e preserva observação', () => {
    expect(montarObservacaoComDoc('NF-1', 'quebrado')).toBe('[Doc: NF-1] quebrado')
    expect(montarObservacaoComDoc('NF-1', '')).toBe('[Doc: NF-1]')
    expect(montarObservacaoComDoc('', 'só obs')).toBe('só obs')
    expect(montarObservacaoComDoc('NF-2', '[Doc: NF-1] texto')).toBe('[Doc: NF-2] texto')
    expect(separarDocObservacao('[Doc: X] y')).toEqual({ referencia: 'X', observacao: 'y' })
  })
})

/** Espelho do contrato da RPC ajustar_estoque_manual_seguro (kardex tipo_codigo). */
function tipoCodigoAjuste(delta: number, motivo: string): string {
  if (delta > 0) return 'ENTRADA_AJUSTE'
  if (motivo === 'PERDA' || motivo === 'QUEBRA') return 'SAIDA_AVARIA'
  return 'SAIDA_AJUSTE'
}

describe('Kardex tipo_codigo (contrato RPC)', () => {
  it('retirada perda/quebra → SAIDA_AVARIA; ajuste −/+ corretos', () => {
    expect(tipoCodigoAjuste(-3, 'PERDA')).toBe('SAIDA_AVARIA')
    expect(tipoCodigoAjuste(-3, 'QUEBRA')).toBe('SAIDA_AVARIA')
    expect(tipoCodigoAjuste(-3, 'ACERTO_INVENTARIO')).toBe('SAIDA_AJUSTE')
    expect(tipoCodigoAjuste(3, 'ACERTO_INVENTARIO')).toBe('ENTRADA_AJUSTE')
  })
})
