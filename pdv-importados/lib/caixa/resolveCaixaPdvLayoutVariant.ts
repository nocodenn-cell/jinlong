export type CaixaPdvLayoutVariant = 'default' | 'classic'

/**
 * Resolve o layout visual do `/caixa`.
 * Por omissão usa `classic` (alinhado ao admin claro da demo comercial).
 * Use `NEXT_PUBLIC_CAIXA_PDV_LAYOUT=default` para restaurar o layout oriental legado.
 */
export function resolveCaixaPdvLayoutVariant(
  envValue: string | undefined = process.env.NEXT_PUBLIC_CAIXA_PDV_LAYOUT,
): CaixaPdvLayoutVariant {
  if (envValue === 'default') return 'default'
  if (envValue === 'classic') return 'classic'
  return 'classic'
}
