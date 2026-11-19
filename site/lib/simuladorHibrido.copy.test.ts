import { describe, expect, it } from 'vitest'
import { getSimuladorCopy } from './simuladorHibrido.copy'
import type { SiteLocale } from './locales'

// Regressão: em 12/11/2026 o prazo de 30/10/2026 já passou e não pode aparecer como futuro.
const FUTURO_30_10 = /até 30\/10|antes de 30\/10|antes da? 30\/10|10 月 30 日前|截止.*2026 年 10 月 30 日(?!，已)/

function textos(locale: SiteLocale): string[] {
  const c = getSimuladorCopy(locale)
  return [c.metaDescription, c.deadline, c.rec.puro, c.rec.hibrido, c.rec.avaliar, c.rec.fora]
}

describe('copy do simulador: prazo tributário', () => {
  for (const locale of ['pt-BR', 'zh-CN'] as const) {
    it(`${locale}: nenhum texto trata 30/10/2026 como prazo futuro`, () => {
      for (const t of textos(locale)) {
        expect(t).not.toMatch(FUTURO_30_10)
      }
    })
  }

  it('pt-BR: informa que a opção encerrou e a janela de cancelamento', () => {
    const c = getSimuladorCopy('pt-BR')
    expect(c.deadline).toContain('encerrou em 30/10/2026')
    expect(c.deadline).toContain('03/11 a 20/12/2026')
  })
})
