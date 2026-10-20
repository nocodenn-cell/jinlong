import { describe, expect, it } from 'vitest'
import { detectarPreset, ehDataCivil, hrefComPeriodo, intervaloDoPreset, resolverPeriodoCivil } from './periodoCivil'

const HOJE = '2026-10-20'

describe('periodoCivil', () => {
  it('presets em datas civis', () => {
    expect(intervaloDoPreset('hoje', HOJE)).toEqual({ de: HOJE, ate: HOJE })
    expect(intervaloDoPreset('7d', HOJE)).toEqual({ de: '2026-10-14', ate: HOJE })
    expect(intervaloDoPreset('mes', HOJE)).toEqual({ de: '2026-10-01', ate: HOJE })
    expect(intervaloDoPreset('7d', '2026-03-03')).toEqual({ de: '2026-02-25', ate: '2026-03-03' })
  })
  it('detecta preset e personalizado', () => {
    expect(detectarPreset('2026-10-14', HOJE, HOJE)).toBe('7d')
    expect(detectarPreset('2026-09-01', '2026-09-30', HOJE)).toBe('personalizado')
  })
  it('padrão Mês atual sem parâmetros', () => {
    expect(resolverPeriodoCivil(undefined, undefined, HOJE)).toEqual({ de: '2026-10-01', ate: HOJE, preset: 'mes', ehPadrao: true })
  })
  it('valida datas e troca período invertido', () => {
    expect(ehDataCivil('2026-02-30')).toBe(false)
    expect(resolverPeriodoCivil('lixo', '2026-02-30', HOJE).ehPadrao).toBe(true)
    expect(resolverPeriodoCivil('2026-09-30', '2026-09-01', HOJE)).toMatchObject({ de: '2026-09-01', ate: '2026-09-30', preset: 'personalizado', ehPadrao: false })
  })
  it('href preserva aba, zera paginação e remove período ao limpar', () => {
    expect(hrefComPeriodo('/admin/financeiro', 'tab=recebiveis&pagina=3', { de: HOJE, ate: HOJE })).toBe('/admin/financeiro?tab=recebiveis&de=2026-10-20&ate=2026-10-20')
    expect(hrefComPeriodo('/admin/financeiro', 'tab=recebiveis&de=a&ate=b&page=2', null)).toBe('/admin/financeiro?tab=recebiveis')
    expect(hrefComPeriodo('/x', '', null)).toBe('/x')
  })
})
