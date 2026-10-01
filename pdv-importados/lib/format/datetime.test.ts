import { afterEach, describe, expect, it } from 'vitest'
import {
  FUSO_NEGOCIO,
  formatDateOrDash,
  formatDateTimeLocaleDefault,
  formatDateTimeOrDash,
  formatDayMonthInLocale,
} from './datetime'

describe('formatDateTimeOrDash', () => {
  it('retorna traco para null, undefined, string vazia ou data invalida', () => {
    expect(formatDateTimeOrDash(null, 'pt-BR')).toBe('—')
    expect(formatDateTimeOrDash(undefined, 'pt-BR')).toBe('—')
    expect(formatDateTimeOrDash('', 'pt-BR')).toBe('—')
    expect(formatDateTimeOrDash('invalido', 'pt-BR')).toBe('—')
  })

  it('aceita Date valido e retorna texto nao vazio', () => {
    const s = formatDateTimeOrDash(new Date('2024-06-10T15:00:00.000Z'), 'en-CA', 'short')
    expect(s).not.toBe('—')
    expect(s.length).toBeGreaterThan(4)
  })

  it('aceita ISO string valida', () => {
    const s = formatDateTimeOrDash('2024-06-10T15:00:00.000Z', 'pt-BR', 'short')
    expect(s).not.toBe('—')
  })

  it('timeStyle medium ainda formata sem retornar traco', () => {
    const s = formatDateTimeOrDash('2024-06-10T15:30:45.000Z', 'pt-BR', 'medium')
    expect(s).not.toBe('—')
  })
})

/** O fuso do runtime NÃO pode influenciar o resultado (Server Component = UTC; navegador = local). */
const TZ_ORIGINAL = process.env.TZ
afterEach(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ
  else process.env.TZ = TZ_ORIGINAL
})
const RUNTIMES = ['UTC', 'America/Sao_Paulo', 'Asia/Shanghai', 'America/New_York']

describe('fuso de negócio (UX-003)', () => {
  it('FUSO_NEGOCIO é America/Sao_Paulo', () => {
    expect(FUSO_NEGOCIO).toBe('America/Sao_Paulo')
  })

  it.each(RUNTIMES)('03:24:27Z vira 00:24:27 em São Paulo com runtime em %s', (tz) => {
    process.env.TZ = tz
    expect(formatDateTimeLocaleDefault('2026-09-30T03:24:27.000Z', 'pt-BR')).toBe('30/09/2026, 00:24:27')
    expect(formatDateTimeOrDash('2026-09-30T03:24:27.000Z', 'pt-BR', 'medium')).toBe('30/09/2026, 00:24:27')
    expect(formatDateTimeOrDash('2026-09-30T03:24:27.000Z', 'pt-BR', 'short')).toBe('30/09/2026, 00:24')
  })

  it('aceita offset explícito e atravessa a virada de dia', () => {
    expect(formatDateTimeOrDash('2026-10-01T02:30:00+00:00', 'pt-BR', 'short')).toBe('30/09/2026, 23:30')
  })

  it('mesmo instante: Dashboard (formatDateTimeLocaleDefault) e Vendas (formatDateTimeOrDash) têm o mesmo horário', () => {
    for (const tz of RUNTIMES) {
      process.env.TZ = tz
      const iso = '2026-09-30T03:53:10.000Z'
      expect(formatDateTimeLocaleDefault(iso, 'pt-BR')).toContain('00:53:10')
      expect(formatDateTimeOrDash(iso, 'pt-BR', 'medium')).toContain('00:53:10')
    }
  })

  it('nulos e inválidos continuam retornando "—"', () => {
    for (const fn of [formatDateTimeLocaleDefault, (v: string | null | undefined, l: string) => formatDateOrDash(v, l)]) {
      expect(fn(null, 'pt-BR')).toBe('—')
      expect(fn(undefined, 'pt-BR')).toBe('—')
      expect(fn('', 'pt-BR')).toBe('—')
      expect(fn('invalido', 'pt-BR')).toBe('—')
    }
  })
})

describe('formatDateOrDash — data sem horário (vencimento)', () => {
  it.each(RUNTIMES)('"2026-09-01" continua dia 01/09/2026 com runtime em %s (sem deslocar para 31/08 21:00)', (tz) => {
    process.env.TZ = tz
    expect(formatDateOrDash('2026-09-01', 'pt-BR')).toBe('01/09/2026')
    expect(formatDateOrDash('2026-08-31', 'pt-BR')).toBe('31/08/2026')
  })

  it('não mostra horário e mantém pt-BR', () => {
    expect(formatDateOrDash('2026-09-01', 'pt-BR')).not.toMatch(/:/)
  })

  it('instante completo usa o fuso de negócio', () => {
    expect(formatDateOrDash('2026-10-01T02:30:00Z', 'pt-BR')).toBe('30/09/2026')
  })
})

describe('formatDayMonthInLocale — dia civil do runtime não é deslocado', () => {
  it.each(RUNTIMES)('new Date(2026, 8, 30) → 30/09 com runtime em %s', (tz) => {
    process.env.TZ = tz
    expect(formatDayMonthInLocale(new Date(2026, 8, 30), 'pt-BR')).toBe('30/09')
  })
})
