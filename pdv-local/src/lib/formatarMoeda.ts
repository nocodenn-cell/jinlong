/** Formatação de moeda só para exibição (não altera valores, payloads nem arredondamento). */
const formatadorBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarBRL(valor: number): string {
  return formatadorBRL.format(Number.isFinite(valor) ? valor : 0)
}
