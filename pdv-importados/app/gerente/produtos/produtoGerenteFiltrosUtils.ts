/** Converte texto livre (vírgulas/ponto-e-vírgula) em tags para filtro por array. */
export function parseTagsFiltroTexto(raw: string): string[] {
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(parts)].slice(0, 20)
}
