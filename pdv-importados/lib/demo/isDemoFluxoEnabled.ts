/**
 * Fluxo demo E2E — somente staging / homologação.
 * Produção: manter desligado (omitir ou false).
 */
export function isDemoFluxoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEMO_FLUXO === 'true'
}

/** Produto do catálogo demo (migration 027). */
export const DEMO_FLUXO_PRODUTO_CODIGO = '7898512340015'

export const DEMO_FLUXO_TROCO_INICIAL = 100
