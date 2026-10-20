import { getContactChannels } from '@/lib/contactChannels'
import type { SiteLocale } from '@/lib/locales'

export function hasContactChannel(locale: SiteLocale): boolean {
  return getContactChannels(locale).length > 0
}

interface TrialCtaProps {
  locale: SiteLocale
  label: string
  className?: string
}

/**
 * CTA de teste: só existe com canal de contato válido configurado (nunca link vazio).
 * WhatsApp (quando configurado) abre a conversa; senão, e-mail (mailto) para a equipe.
 */
export function TrialCta({ locale, label, className = 'jl-btn jl-btn--secondary' }: TrialCtaProps) {
  const [first] = getContactChannels(locale)
  if (!first) return null
  if (first.id === 'whatsapp') {
    return (
      <a className={className} href={first.href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    )
  }
  return (
    <a className={className} href={first.href}>
      {label}
    </a>
  )
}
