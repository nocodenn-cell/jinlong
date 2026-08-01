import { describe, expect, it } from 'vitest'
import {
  RECEBIMENTO_TRANSITIONS,
  contarDivergencias,
  isRecebimentoFinalizado,
  podeConferirRecebimento,
  podeConfirmarRecebimento,
  podeTransicionarRecebimento,
  statusAposConferencia,
  temItemNaoConferido,
  type ItemConferencia,
} from './recebimentoStatus'

const item = (esperada: number, conferida: number | null): ItemConferencia => ({
  quantidadeEsperada: esperada,
  quantidadeConferida: conferida,
})

describe('recebimento — máquina de estados (Onda B)', () => {
  it('confirmar exige ter passado pela conferência', () => {
    // O buraco que a Onda B fecha: EM_CONFERENCIA não confirma direto.
    expect(podeConfirmarRecebimento('EM_CONFERENCIA')).toBe(false)
    expect(podeConfirmarRecebimento('RASCUNHO')).toBe(false)
    expect(podeConfirmarRecebimento('CONFERIDO')).toBe(true)
    expect(podeConfirmarRecebimento('DIVERGENTE')).toBe(true)
  })

  it('estados finais não aceitam nada', () => {
    for (const final of ['CONCLUIDA', 'CANCELADA'] as const) {
      expect(isRecebimentoFinalizado(final)).toBe(true)
      expect(RECEBIMENTO_TRANSITIONS[final]).toEqual([])
      expect(podeConfirmarRecebimento(final)).toBe(false)
      expect(podeConferirRecebimento(final)).toBe(false)
    }
  })

  it('recontagem é permitida depois de conferido ou divergente', () => {
    expect(podeConferirRecebimento('CONFERIDO')).toBe(true)
    expect(podeConferirRecebimento('DIVERGENTE')).toBe(true)
    expect(podeTransicionarRecebimento('DIVERGENTE', 'CONFERIDO')).toBe(true)
  })

  it('não há caminho de volta a partir de CONCLUIDA', () => {
    expect(podeTransicionarRecebimento('CONCLUIDA', 'EM_CONFERENCIA')).toBe(false)
    expect(podeTransicionarRecebimento('CONCLUIDA', 'CANCELADA')).toBe(false)
  })
})

describe('recebimento — status derivado da contagem', () => {
  it('item sem contagem mantém EM_CONFERENCIA', () => {
    const itens = [item(10, 10), item(5, null)]
    expect(temItemNaoConferido(itens)).toBe(true)
    expect(statusAposConferencia(itens)).toBe('EM_CONFERENCIA')
  })

  it('tudo contado e batendo vira CONFERIDO', () => {
    const itens = [item(10, 10), item(5, 5)]
    expect(contarDivergencias(itens)).toBe(0)
    expect(statusAposConferencia(itens)).toBe('CONFERIDO')
  })

  it('contado diferente do esperado vira DIVERGENTE', () => {
    const itens = [item(10, 8), item(5, 5)]
    expect(contarDivergencias(itens)).toBe(1)
    expect(statusAposConferencia(itens)).toBe('DIVERGENTE')
  })

  it('zero contado é divergência, não ausência de contagem', () => {
    // `0` = "contei e não veio"; `null` = "não contei". Casos diferentes.
    const itens = [item(10, 0)]
    expect(temItemNaoConferido(itens)).toBe(false)
    expect(contarDivergencias(itens)).toBe(1)
    expect(statusAposConferencia(itens)).toBe('DIVERGENTE')
  })

  it('esperado zero e contado zero não é divergência', () => {
    expect(statusAposConferencia([item(0, 0)])).toBe('CONFERIDO')
  })

  it('tolera arredondamento de numeric(10,3)', () => {
    expect(contarDivergencias([item(1.0005, 1.0005)])).toBe(0)
  })

  it('lista vazia não é conferência concluída', () => {
    expect(statusAposConferencia([])).toBe('EM_CONFERENCIA')
  })
})
