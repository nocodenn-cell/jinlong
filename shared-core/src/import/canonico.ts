/**
 * Serialização canônica de entradas do motor.
 *
 * Pura: não calcula hash. O hash (sha256) é responsabilidade do adapter, que
 * recebe esta string e a registra junto da versão de cálculo.
 *
 * Regras (`docs/import-intelligence/02-CONTRATOS.md` §1):
 * - chaves de objeto em ordem lexicográfica;
 * - listas de entidades (itens, despesas, descontos, tributos, câmbios) em ordem de `id`;
 * - demais arrays mantêm a ordem.
 */

const LISTAS_ORDENADAS_POR_ID = new Set(['itens', 'despesas', 'descontos', 'tributos', 'cambios'])

function ordenaPorId(lista: readonly unknown[]): unknown[] {
  return [...lista].sort((a, b) => {
    const ia = String((a as { id?: unknown }).id ?? '')
    const ib = String((b as { id?: unknown }).id ?? '')
    return ia < ib ? -1 : ia > ib ? 1 : 0
  })
}

function normaliza(valor: unknown, chaveAtual?: string): unknown {
  if (Array.isArray(valor)) {
    const base = chaveAtual && LISTAS_ORDENADAS_POR_ID.has(chaveAtual) ? ordenaPorId(valor) : valor
    return base.map((v) => normaliza(v))
  }
  if (valor !== null && typeof valor === 'object') {
    const saida: Record<string, unknown> = {}
    for (const k of Object.keys(valor).sort()) {
      saida[k] = normaliza((valor as Record<string, unknown>)[k], k)
    }
    return saida
  }
  return valor
}

/** Serialização canônica: JSON sem espaços, chaves ordenadas, listas por `id`. */
export function serializarCanonico(entrada: unknown): string {
  return JSON.stringify(normaliza(entrada))
}
