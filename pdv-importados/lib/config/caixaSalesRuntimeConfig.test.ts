import { afterEach, describe, expect, it } from 'vitest'
import { getCaixaSalesRuntimeConfig } from '@/lib/config/caixaSalesRuntimeConfig'

const ORIGINAL_ENV = { ...process.env }

function setEnv(flags: Partial<Record<'USE_UNIFIED_SALES_FLOW' | 'STRICT_MANAGER_DISCOUNT_AUTH' | 'AUTO_ENQUEUE_FISCAL_ON_SALE', string | undefined>>) {
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
      USE_UNIFIED_SALES_FLOW: undefined,
      STRICT_MANAGER_DISCOUNT_AUTH: undefined,
      AUTO_ENQUEUE_FISCAL_ON_SALE: undefined,
    })

    const cfg = getCaixaSalesRuntimeConfig()
    expect(cfg.useUnifiedSalesFlow).toBe(true)
    expect(cfg.strictManagerDiscountAuth).toBe(true)
    expect(cfg.autoEnqueueFiscalOnSale).toBe(false)
    expect(cfg.hasInvalidFlags).toBe(false)
  })

  it('marca flags inválidas quando valor não é booleano reconhecido', () => {
    setEnv({
      USE_UNIFIED_SALES_FLOW: 'talvez',
      STRICT_MANAGER_DISCOUNT_AUTH: 'TRUE',
      AUTO_ENQUEUE_FISCAL_ON_SALE: '0',
    })

    const cfg = getCaixaSalesRuntimeConfig()
    expect(cfg.hasInvalidFlags).toBe(true)
    expect(cfg.invalidFlags).toContain('USE_UNIFIED_SALES_FLOW')
    expect(cfg.strictManagerDiscountAuth).toBe(true)
    expect(cfg.autoEnqueueFiscalOnSale).toBe(false)
  })
})

