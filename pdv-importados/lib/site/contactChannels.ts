import type { SiteLocale } from './locales'

/**
 * Canais de atendimento vêm exclusivamente de variáveis de ambiente.
 * Nunca há número, conta ou link embutido no código; valor ausente ou
 * inválido simplesmente não gera canal.
 */

export type ContactChannelId = 'whatsapp' | 'wechat'

export type ContactChannel =
  | { id: 'whatsapp'; href: string }
  | { id: 'wechat'; wechatId: string }

type SiteEnv = Readonly<Record<string, string | undefined>>

const WHATSAPP_URL = /^https:\/\/(wa\.me\/\d{8,15}|api\.whatsapp\.com\/send\?phone=\d{8,15})([?&][\w=%.+-]*)?$/
const WECHAT_ID = /^[A-Za-z][-_A-Za-z0-9]{5,19}$/

export function parseWhatsappUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  return value && WHATSAPP_URL.test(value) ? value : null
}

export function parseWechatId(raw: string | undefined): string | null {
  const value = raw?.trim()
  return value && WECHAT_ID.test(value) ? value : null
}

function readChannels(env: SiteEnv): ContactChannel[] {
  const channels: ContactChannel[] = []
  const href = parseWhatsappUrl(env.NEXT_PUBLIC_SITE_WHATSAPP_URL)
  if (href) channels.push({ id: 'whatsapp', href })
  const wechatId = parseWechatId(env.NEXT_PUBLIC_SITE_WECHAT_ID)
  if (wechatId) channels.push({ id: 'wechat', wechatId })
  return channels
}

/** Canal principal do idioma primeiro: WhatsApp em pt-BR, WeChat em zh-CN. */
export function getContactChannels(
  locale: SiteLocale,
  env: SiteEnv = process.env
): ContactChannel[] {
  const preferred: ContactChannelId = locale === 'zh-CN' ? 'wechat' : 'whatsapp'
  return readChannels(env).sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred)
  )
}
