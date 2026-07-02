/**
 * Variantes da leitura (scanner/teclado) para bater com o que está cadastrado
 * em codigo_barras. Nota: pdv-local/src/catalogoLookup.ts tem lógica análoga,
 * mas o desktop está congelado (ADR-PDV-001 §1) — NÃO há obrigação de manter
 * paridade; esta implementação é a canónica.
 */

export function variantesChaveLeitura(input: string): string[] {
  const t = input.trim()
  const out: string[] = []
  const seen = new Set<string>()
  const add = (s: string) => {
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }

  add(t)
  add(t.toLowerCase())
  add(t.replace(/\s+/g, ''))

  const digits = t.replace(/\D/g, '')
  if (digits) {
    add(digits)
    const stripped = digits.replace(/^0+/, '') || '0'
    if (stripped !== digits) add(stripped)
    if (digits.length > 13) add(digits.slice(0, 13))
    if (digits.length > 12) add(digits.slice(0, 12))
    if (digits.length > 8) add(digits.slice(0, 8))
  }

  return out
}
