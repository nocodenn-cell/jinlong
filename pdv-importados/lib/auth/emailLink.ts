import type { EmailOtpType } from '@supabase/supabase-js'

/** Tipos de link de e-mail aceitos em /auth/confirm (token_hash). */
const TIPOS: readonly EmailOtpType[] = ['recovery', 'invite', 'signup', 'magiclink', 'email', 'email_change']

export function parseEmailOtpType(raw: string | null | undefined): EmailOtpType | null {
  return raw && (TIPOS as readonly string[]).includes(raw) ? (raw as EmailOtpType) : null
}

/** Destino seguro pós-link: só caminhos internos conhecidos; padrão = redefinir senha. */
export function safeAuthNextPath(raw: string | null | undefined, fallback = '/auth/redefinir-senha'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  if (/^\/(auth|login|admin|caixa|gerente)(\/|$|\?)/.test(raw)) return raw
  return fallback
}

/**
 * Erros do Supabase chegam no fragmento (#error=...&error_code=otp_expired),
 * que o servidor não vê. Converte para o código de erro usado nas telas.
 */
export function erroDoFragmento(hash: string | null | undefined): 'link_expirado' | 'link_invalido' | null {
  if (!hash) return null
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const code = p.get('error_code') ?? p.get('error')
  if (!code) return null
  return code === 'otp_expired' ? 'link_expirado' : 'link_invalido'
}
