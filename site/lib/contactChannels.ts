import type { SiteLocale } from './locales'

/**
 * Canais de atendimento.
 *  - E-mail: endereço oficial definido pelo dono do negócio (sempre presente).
 *  - WhatsApp: só por variável de ambiente (NEXT_PUBLIC_SITE_WHATSAPP_URL); valor ausente
 *    ou inválido não gera canal.
 * WeChat não é usado no site.
 */

export const CONTACT_EMAIL = 'naturalcodedevelop@gmail.com'

export type ContactChannelId = 'whatsapp' | 'email'

export type ContactChannel =
  | { id: 'whatsapp'; href: string }
  | { id: 'email'; href: string; address: string }

type SiteEnv = Readonly<Record<string, string | undefined>>

const WHATSAPP_URL = /^https:\/\/(wa\.me\/\d{8,15}|api\.whatsapp\.com\/send\?phone=\d{8,15})([?&][\w=%.+-]*)?$/

export function parseWhatsappUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  return value && WHATSAPP_URL.test(value) ? value : null
}

const MAIL_SUBJECT: Record<SiteLocale, string> = {
  'pt-BR': 'Jinlong: agendar demonstração',
  'zh-CN': '金龙：预约演示',
}

export function emailHref(locale: SiteLocale): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(MAIL_SUBJECT[locale])}`
}

/** WhatsApp (quando configurado) primeiro; e-mail sempre disponível como alternativa. */
export function getContactChannels(locale: SiteLocale, env: SiteEnv = process.env): ContactChannel[] {
  const channels: ContactChannel[] = []
  const href = parseWhatsappUrl(env.NEXT_PUBLIC_SITE_WHATSAPP_URL)
  if (href) channels.push({ id: 'whatsapp', href })
  channels.push({ id: 'email', href: emailHref(locale), address: CONTACT_EMAIL })
  return channels
}
