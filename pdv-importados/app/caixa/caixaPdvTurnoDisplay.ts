/**
 * Identificador numérico estável para exibir “TURNO #n” no PDV web quando não há
 * sequencial de turno persistido; deriva do UUID do caixa aberto.
 */
export function turnoNumeroDeCaixaId(caixaId: string): number {
  const compact = caixaId.replace(/-/g, "")
  let h = 0
  for (let i = 0; i < compact.length; i++) {
    h = (Math.imul(h, 33) + compact.charCodeAt(i)) >>> 0
  }
  return (h % 99_000) + 1
}
