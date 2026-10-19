/**
 * Seleção de empresa (ESPEC_MULTIEMPRESA_V1 §9) para usuário com vínculo em 2+ empresas.
 * O cookie NÃO é segredo nem autorização: o banco só ESTREITA o escopo pelo header `x-fp-empresa`
 * (empresa fora dos vínculos ⇒ nada visível), e a ação de seleção valida o vínculo no servidor.
 */
export const COOKIE_EMPRESA = 'fp_empresa'
export const HEADER_EMPRESA = 'x-fp-empresa'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizarEmpresaId(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null
}

export function headersEmpresa(v: unknown): Record<string, string> {
  const id = normalizarEmpresaId(v)
  return id ? { [HEADER_EMPRESA]: id } : {}
}

/** Lê o cookie no browser (document.cookie). */
export function empresaDoDocumentCookie(cookie: string | undefined): string | null {
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === COOKIE_EMPRESA) return normalizarEmpresaId(decodeURIComponent(rest.join('=')))
  }
  return null
}

/** `next` seguro: só caminho interno. */
export function destinoSeguro(next: unknown, padrao = '/gerente'): string {
  if (typeof next !== 'string') return padrao
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return padrao
  return next
}
