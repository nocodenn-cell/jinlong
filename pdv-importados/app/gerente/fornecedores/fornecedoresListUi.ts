/**
 * Helpers puros da listagem de Fornecedores (UI only — sem I/O).
 */

export function filtrosFornecedorAtivos(termo: string): boolean {
  return termo.trim().length > 0
}

export function montarTituloContagem(
  carregados: number,
  hasMore: boolean,
  labels: { mostrando: string; ha_mais: string },
): string {
  const base = labels.mostrando.replace('{n}', String(carregados))
  return hasMore ? `${base} · ${labels.ha_mais}` : base
}

export function maskCnpj(raw: string): string {
  const x = (raw ?? '').replace(/\D/g, '').slice(0, 14)
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return x.replace(/(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2})/, (_, a, b, c, d, e) =>
    [a, b && `.${b}`, c && `.${c}`, d && `/${d}`, e && `-${e}`].filter(Boolean).join(''),
  )
}
