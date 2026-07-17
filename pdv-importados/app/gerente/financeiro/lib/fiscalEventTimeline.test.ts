import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { labelFiscalEventoTipo, linhasDescricaoPayloadErro, linhasDescricaoPayloadGenerico } from './fiscalEventTimeline'

const m = getMessages('pt')

describe('fiscalEventTimeline', () => {
  it('labelFiscalEventoTipo mapeia tipos conhecidos', () => {
    expect(labelFiscalEventoTipo('REPROCESSO_MANUAL', m)).toBe('Reprocesso manual')
    expect(labelFiscalEventoTipo('UNKNOWN', m)).toBe('UNKNOWN')
  })

  it('linhasDescricaoPayloadErro mostra diff quando há anterior', () => {
    const lines = linhasDescricaoPayloadErro(
      {
        ultimo_erro: 'b',
        ultimo_erro_anterior: 'a',
        fiscal_error_code: 'E2',
        fiscal_error_code_anterior: 'E1',
        fiscal_error_category: 'Y',
        fiscal_error_category_anterior: 'X',
        tentativas: 2,
        proxima_tentativa_em: '2026-01-01T00:00:00Z',
      },
      m,
    )
    expect(lines.some((l) => l.includes('a → b'))).toBe(true)
    expect(lines.some((l) => l.includes('E1 → E2'))).toBe(true)
    expect(lines.some((l) => l.includes('X → Y'))).toBe(true)
    expect(lines.some((l) => l.includes('Tentativas: 2'))).toBe(true)
  })

  it('linhasDescricaoPayloadGenerico para REPROCESSO_MANUAL', () => {
    const lines = linhasDescricaoPayloadGenerico(
      'REPROCESSO_MANUAL',
      {
        ultimo_erro_prev: 'falhou',
        fiscal_error_code_prev: 'TIMEOUT',
      },
      m,
    )
    expect(lines.join(' ')).toContain('falhou')
    expect(lines.join(' ')).toContain('TIMEOUT')
  })
})
