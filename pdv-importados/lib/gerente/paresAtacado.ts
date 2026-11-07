/**
 * D6 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06, P0-10 / D-11 aprovado):
 * o preço de atacado do cadastro só vale na venda quando há quantidade mínima (gatilho).
 * O servidor deriva a faixa de `precos_atacado` a partir do par (preço, gatilho)
 * (ver derivarFaixaAtacado em app/admin/produtos/productUpdater.ts). Sem gatilho, a faixa
 * não existe e o preço fica gravado no catálogo sem efeito na venda.
 *
 * Regra única: preço e gatilho são informados juntos ou nenhum dos dois.
 */
export type ErroParAtacado = 'ATACADO_SEM_GATILHO' | 'GATILHO_SEM_ATACADO'

export function validarParAtacado(
  precoAtacado: number | null | undefined,
  quantidadeGatilho: number | null | undefined,
): ErroParAtacado | null {
  const temPreco = precoAtacado != null
  const temGatilho = quantidadeGatilho != null
  if (temPreco && !temGatilho) return 'ATACADO_SEM_GATILHO'
  if (!temPreco && temGatilho) return 'GATILHO_SEM_ATACADO'
  return null
}
