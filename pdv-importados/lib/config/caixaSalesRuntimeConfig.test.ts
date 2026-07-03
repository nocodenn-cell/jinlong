import { afterEach, describe, expect, it } from 'vitest'
import { getCaixaSalesRuntimeConfig } from '@/lib/config/caixaSalesRuntimeConfig'

const ORIGINAL_ENV = { ...process.env }

function setEnv(flags: Partial<Record<'STRICT_MANAGER_DISCOUNT_AUTH' | 'AUTO_ENQUEUE_FISCAL_ON_SALE', string | undefined>>) {
  for (const [key, value] of Object.entries(flags)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('getCaixaSalesRuntimeConfig', () => {
  it('aplica defaults determinísticos quando flag não está definida', () => {
    setEnv({
      STRICT_MANAGER_DISCOUNT_AUTH: undefined,
      AUTO_ENQUEUE_FISCAL_ON_SALE: undefined,
    })

    const cfg = getCaixaSalesRuntimeConfig()
    expect(cfg.strictManagerDiscountAuth).toBe(true)
    expect(cfg.autoEnqueueFiscalOnSale).toBe(false)
    expect(cfg.hasInvalidFlags).toBe(false)
  })

  it('marca flags inválidas quando valor não é booleano reconhecido', () => {
    // 'TRUE'/'True' são ACEITOS (parse case-insensitive) — rejeitá-los
    // bloquearia a finalização de venda (caixaVendas.impl.ts aborta com
    // hasInvalidFlags) para ambientes com essa grafia. Valor inválido de
    // verdade é algo fora do vocabulário booleano, ex.: 'maybe'.
    setEnv({
      STRICT_MANAGER_DISCOUNT_AUTH: 'maybe',
      AUTO_ENQUEUE_FISCAL_ON_SALE: '0',
    })

    const cfg = getCaixaSalesRuntimeConfig()
    expect(cfg.hasInvalidFlags).toBe(true)
    expect(cfg.invalidFlags).toEqual(['STRICT_MANAGER_DISCOUNT_AUTH'])
    expect(cfg.strictManagerDiscountAuth).toBe(true)
    expect(cfg.autoEnqueueFiscalOnSale).toBe(false)
  })

  it('aceita booleanos com caixa mista (TRUE/False) sem marcar inválido', () => {
    setEnv({
      STRICT_MANAGER_DISCOUNT_AUTH: 'TRUE',
      AUTO_ENQUEUE_FISCAL_ON_SALE: 'False',
    })

    const cfg = getCaixaSalesRuntimeConfig()
    expect(cfg.hasInvalidFlags).toBe(false)
    expect(cfg.strictManagerDiscountAuth).toBe(true)
    expect(cfg.autoEnqueueFiscalOnSale).toBe(false)
    expect(cfg.source.STRICT_MANAGER_DISCOUNT_AUTH).toBe('env')
  })
})
