/**
 * Validações de dígito verificador usadas só para AVISAR o operador (UX-020): o sistema aceita códigos
 * internos e documentos de teste, então nada aqui bloqueia o cadastro.
 */

function soDigitos(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** CNPJ numérico (14 dígitos) com os dois dígitos verificadores corretos; rejeita sequências repetidas. */
export function cnpjDvValido(raw: string): boolean {
  const d = soDigitos(raw)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const p2 = [6, ...p1]
  const d1 = dv(d.slice(0, 12), p1)
  const d2 = dv(d.slice(0, 12) + d1, p2)
  return d[12] === String(d1) && d[13] === String(d2)
}

/** Dígito verificador GS1 (EAN-8, UPC-A/12, EAN-13, ITF-14): módulo 10 com pesos 3,1 alternados da direita. */
export function eanDvValido(raw: string): boolean {
  const d = raw.trim()
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return false
  const corpo = d.slice(0, -1).split('').reverse()
  const soma = corpo.reduce((acc, n, i) => acc + Number(n) * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === Number(d[d.length - 1])
}

/**
 * Código de barras que PARECE um EAN/UPC (só dígitos, 8/12/13/14) mas tem DV errado — sinal forte de
 * digitação errada. Códigos internos (letras, tamanhos diferentes) não geram aviso.
 */
export function eanComDvSuspeito(raw: string | null | undefined): boolean {
  const d = (raw ?? '').trim()
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return false
  return !eanDvValido(d)
}

/** Nome já existente na lista (sem diferenciar maiúsculas, acentos nem espaços extras). */
export function nomeJaExiste(
  nome: string,
  existentes: ReadonlyArray<string>,
  ignorar?: string | null,
): boolean {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const alvo = norm(nome)
  if (alvo.length < 2) return false
  const ig = ignorar ? norm(ignorar) : null
  return existentes.some((e) => {
    const n = norm(e)
    return n === alvo && n !== ig
  })
}
