type CriticalSalesFlagName =
  | 'STRICT_MANAGER_DISCOUNT_AUTH'
  | 'AUTO_ENQUEUE_FISCAL_ON_SALE'

type ParsedFlag = {
  value: boolean
  rawValue: string | undefined
  usedDefault: boolean
}

export type CaixaSalesRuntimeConfig = {
  strictManagerDiscountAuth: boolean
  autoEnqueueFiscalOnSale: boolean
  hasInvalidFlags: boolean
  invalidFlags: CriticalSalesFlagName[]
  source: Record<CriticalSalesFlagName, 'env' | 'default'>
}

const DEFAULT_FLAGS: Record<CriticalSalesFlagName, boolean> = {
  STRICT_MANAGER_DISCOUNT_AUTH: true,
  AUTO_ENQUEUE_FISCAL_ON_SALE: false,
}

function parseBoolean(rawValue: string | undefined): boolean | undefined {
  if (rawValue === undefined) return undefined
  const normalized = rawValue.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false
  return undefined
}

/**
 * Flag vazia/só-espaços (`FLAG=` em .env) equivale a NÃO DEFINIDA: aplica o
 * default seguro sem marcar inválida. `hasInvalidFlags` existe para pegar
 * typo em valor (ex.: 'ture') — e bloqueia a finalização de venda em
 * caixaVendas.impl.ts; uma linha vazia de .env não pode derrubar o caixa.
 */
function isBlank(rawValue: string | undefined): boolean {
  return rawValue === undefined || rawValue.trim() === ''
}

function resolveFlag(flagName: CriticalSalesFlagName): ParsedFlag {
  const rawValue = process.env[flagName]
  if (isBlank(rawValue)) {
    return {
      value: DEFAULT_FLAGS[flagName],
      rawValue: undefined,
      usedDefault: true,
    }
  }
  const parsed = parseBoolean(rawValue)
  if (parsed === undefined) {
    return {
      value: DEFAULT_FLAGS[flagName],
      rawValue,
      usedDefault: true,
    }
  }
  return {
    value: parsed,
    rawValue,
    usedDefault: false,
  }
}

export function getCaixaSalesRuntimeConfig(): CaixaSalesRuntimeConfig {
  const strict = resolveFlag('STRICT_MANAGER_DISCOUNT_AUTH')
  const fiscal = resolveFlag('AUTO_ENQUEUE_FISCAL_ON_SALE')

  const invalidFlags: CriticalSalesFlagName[] = []
  if (strict.usedDefault && strict.rawValue !== undefined) invalidFlags.push('STRICT_MANAGER_DISCOUNT_AUTH')
  if (fiscal.usedDefault && fiscal.rawValue !== undefined) invalidFlags.push('AUTO_ENQUEUE_FISCAL_ON_SALE')

  return {
    strictManagerDiscountAuth: strict.value,
    autoEnqueueFiscalOnSale: fiscal.value,
    hasInvalidFlags: invalidFlags.length > 0,
    invalidFlags,
    source: {
      STRICT_MANAGER_DISCOUNT_AUTH: strict.usedDefault ? 'default' : 'env',
      AUTO_ENQUEUE_FISCAL_ON_SALE: fiscal.usedDefault ? 'default' : 'env',
    },
  }
}

