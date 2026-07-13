import { describe, expect, it } from 'vitest'
import { isPricingVersionRpcAusente } from './pricingVersionRpcError'

describe('isPricingVersionRpcAusente', () => {
  it('reconhece PGRST202 (schema cache / função ausente no PostgREST)', () => {
    expect(
      isPricingVersionRpcAusente({
        code: 'PGRST202',
        message: 'Could not find the function public.obter_pricing_version_ativa without parameters in the schema cache',
      }),
    ).toBe(true)
  })

  it('reconhece undefined_function Postgres', () => {
    expect(
      isPricingVersionRpcAusente({
        code: '42883',
        message: 'function public.obter_pricing_version_ativa() does not exist',
      }),
    ).toBe(true)
  })

  it('não trata erro genérico de rede/permissão como ausência', () => {
    expect(
      isPricingVersionRpcAusente({
        code: '42501',
        message: 'permission denied for function obter_pricing_version_ativa',
      }),
    ).toBe(false)
  })
})
