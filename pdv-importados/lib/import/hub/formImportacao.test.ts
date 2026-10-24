import { describe, expect, it } from 'vitest'
import { MOEDAS_COMUNS, existeOverride, opcoesMoeda, percentualOverrideValido } from './formImportacao'

const lista = [
  { id: 'a', tributo: 'II', ncm_prefixo: '8517', aliquota_pct: '9.7500' },
  { id: 'b', tributo: 'IPI', ncm_prefixo: '', aliquota_pct: '5.0000' },
]

describe('existeOverride', () => {
  it('encontra o override pela chave (tributo, ncm_prefixo) do upsert', () => {
    expect(existeOverride(lista, 'II', '8517')?.id).toBe('a')
    expect(existeOverride(lista, 'IPI', '')?.id).toBe('b')
  })
  it('não confunde tributo nem prefixo diferentes', () => {
    expect(existeOverride(lista, 'IPI', '8517')).toBeNull()
    expect(existeOverride(lista, 'II', '85171')).toBeNull()
    expect(existeOverride(lista, 'II', '')).toBeNull()
  })
  it('ignora espaços no prefixo e aceita lista vazia/ausente', () => {
    expect(existeOverride(lista, 'II', ' 8517 ')?.id).toBe('a')
    expect(existeOverride([], 'II', '8517')).toBeNull()
    expect(existeOverride(undefined, 'II', '8517')).toBeNull()
  })
})

describe('percentualOverrideValido', () => {
  it('aceita o mesmo formato do servidor (até 2 inteiros e 4 decimais, vírgula ou ponto)', () => {
    for (const v of ['9', '9,75', '9.75', '18', '0,0001', '99.9999']) expect(percentualOverrideValido(v)).toBe(true)
  })
  it('rejeita vazio, 3 inteiros, 5 decimais e lixo', () => {
    for (const v of ['', '100', '9,75181', '9,75%', 'abc', ',5', '9,']) expect(percentualOverrideValido(v)).toBe(false)
  })
})

describe('opcoesMoeda', () => {
  it('lista as moedas comuns', () => {
    expect(opcoesMoeda('USD').map((o) => o.valor)).toEqual([...MOEDAS_COMUNS])
  })
  it('preserva código legado fora da lista (não perde dado)', () => {
    const v = opcoesMoeda('GBP').map((o) => o.valor)
    expect(v).toContain('GBP')
    expect(v).toHaveLength(MOEDAS_COMUNS.length + 1)
  })
  it('não duplica e ignora vazio', () => {
    expect(opcoesMoeda('BRL')).toHaveLength(MOEDAS_COMUNS.length)
    expect(opcoesMoeda('')).toHaveLength(MOEDAS_COMUNS.length)
  })
})
