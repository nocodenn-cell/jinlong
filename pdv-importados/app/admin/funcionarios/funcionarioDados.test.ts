import { describe, expect, it } from 'vitest'
import {
  cpfValido,
  formatarCpf,
  formatarTelefone,
  mascararCpf,
  normalizarDados,
  normalizarTelefone,
  temAlgumDado,
} from './funcionarioDados'

describe('cpfValido', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita %s', (c) => {
    expect(cpfValido(c)).toBe(true)
  })
  it.each(['529.982.247-24', '52998224735', '111.111.111-11', '00000000000', '1234', '', 'abc'])(
    'rejeita %s',
    (c) => expect(cpfValido(c)).toBe(false),
  )
})

describe('formatação e máscara', () => {
  it('formata CPF progressivamente', () => {
    expect(formatarCpf('529')).toBe('529')
    expect(formatarCpf('5299822')).toBe('529.982.2')
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
  })
  it('mascara CPF em listas sem expor os 3 primeiros nem os DV', () => {
    expect(mascararCpf('52998224725')).toBe('***.982.247-**')
    expect(mascararCpf(null)).toBeNull()
    expect(mascararCpf('123')).toBeNull()
  })
  it('telefone', () => {
    expect(normalizarTelefone('(81) 99999-0000')).toBe('81999990000')
    expect(normalizarTelefone('+55 81 99999-0000')).toBe('+5581999990000')
    expect(normalizarTelefone('9999')).toBeNull()
    expect(formatarTelefone('81999990000')).toBe('(81) 99999-0000')
    expect(formatarTelefone('+5581999990000')).toBe('(81) 99999-0000')
    expect(formatarTelefone('8133330000')).toBe('(81) 3333-0000')
  })
})

describe('normalizarDados', () => {
  const hoje = new Date('2026-10-21T12:00:00Z')
  it('tudo vazio vira null (campos opcionais)', () => {
    const r = normalizarDados({ telefone: ' ', cpf: '', cargo: '', data_admissao: '', observacoes: '' }, hoje)
    expect(r.ok && temAlgumDado(r.data)).toBe(false)
    expect(normalizarDados(undefined, hoje).ok).toBe(true)
  })
  it('normaliza campos válidos', () => {
    const r = normalizarDados(
      { telefone: '(81) 99999-0000', cpf: '529.982.247-25', cargo: ' Caixa ', data_admissao: '2026-03-01', observacoes: 'Turno da tarde' },
      hoje,
    )
    expect(r).toEqual({
      ok: true,
      data: { telefone: '81999990000', cpf: '52998224725', cargo: 'Caixa', data_admissao: '2026-03-01', observacoes: 'Turno da tarde' },
    })
  })
  it.each([
    [{ cpf: '529.982.247-24' }, 'cpf'],
    [{ telefone: '123' }, 'telefone'],
    [{ data_admissao: '2026-02-30' }, 'data_admissao'],
    [{ data_admissao: '2030-01-01' }, 'data_admissao'],
    [{ cargo: 'x'.repeat(81) }, 'cargo'],
    [{ observacoes: 'x'.repeat(1001) }, 'observacoes'],
  ])('rejeita %j no campo %s', (input, campo) => {
    expect(normalizarDados(input, hoje)).toEqual({ ok: false, campo })
  })
})
