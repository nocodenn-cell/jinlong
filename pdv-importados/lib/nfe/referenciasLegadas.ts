// D5 — compatibilidade com vínculos gravados pelo parser anterior (cProd/cEAN sem zeros à esquerda).

/**
 * Referências que colidem no formato do parser anterior: dois códigos distintos da MESMA nota
 * (ex.: "0123" e "123") viram o mesmo código legado. Para eles o vínculo legado não é usado.
 */
export function referenciasLegadasAmbiguas(
  itens: { atual: string | null; legado: string | null | undefined }[],
): Set<string> {
  const porLegado = new Map<string, Set<string>>()
  for (const { atual, legado } of itens) {
    if (!atual || !legado) continue
    const s = porLegado.get(legado) ?? new Set<string>()
    s.add(atual)
    porLegado.set(legado, s)
  }
  return new Set([...porLegado].filter(([, atuais]) => atuais.size > 1).map(([legado]) => legado))
}
