/**
 * Classifica erros da RPC `obter_pricing_version_ativa`.
 * Ausência da função = versionamento não provisionado → modo legado (NULL).
 */
export type PricingVersionRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function isPricingVersionRpcAusente(err: PricingVersionRpcError): boolean {
  const code = (err.code ?? '').toUpperCase()
  const msg = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.toLowerCase()
  if (code === 'PGRST202' || code === '42883') return true
  if (msg.includes('could not find the function')) return true
  if (msg.includes('function') && msg.includes('obter_pricing_version_ativa') && msg.includes('does not exist')) {
    return true
  }
  return false
}
