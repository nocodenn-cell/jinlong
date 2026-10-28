/**
 * Entrada única "Entrar no Jinlong": o site manda todos para o login do ERP.
 * Quem é administrador da plataforma (`commercial_admins`, via `is_commercial_admin()`)
 * e não tem vínculo de loja no ERP segue para o painel gerencial (hub, app separado).
 *
 * Sem SSO entre domínios: nenhum token sai do ERP. A sessão do ERP é encerrada e o
 * hub autentica de novo no próprio domínio (cookies httpOnly dele).
 * Sem NEXT_PUBLIC_HUB_URL válido, nada muda (inerte).
 */

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/** Aceita só origem https (ou http local), sem caminho/query — evita open redirect. */
export function parseHubUrl(raw: string | undefined): string | null {
  const value = raw?.trim().replace(/\/+$/, '')
  if (!value) return null
  try {
    const url = new URL(value)
    const valid = url.protocol === 'https:' || LOCAL_HTTP.test(url.origin)
    return valid && url.pathname === '/' && !url.search && !url.hash ? url.origin : null
  } catch {
    return null
  }
}

/** URL do login do painel gerencial; `null` quando o hub não está configurado. */
export function hubLoginUrl(raw: string | undefined = process.env.NEXT_PUBLIC_HUB_URL): string | null {
  const origin = parseHubUrl(raw)
  return origin ? `${origin}/login?origem=jinlong` : null
}
