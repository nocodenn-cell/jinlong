import type { ReactNode } from 'react'
import { getContactChannels } from '@/lib/contactChannels'
import type { SiteLocale } from '@/lib/locales'

export function hasContactChannel(locale: SiteLocale): boolean {
  return getContactChannels(locale).length > 0
}

interface TrialCtaProps {
  locale: SiteLocale
  className: string
  children: ReactNode
}

/**
 * CTA de teste. Com WhatsApp configurado abre a conversa; caso contrário leva à seção de
 * contato do rodapé (que mostra o ID do WeChat ou o aviso de canais em breve). Nunca link vazio.
 */
export function TrialCta({ locale, className, children }: TrialCtaProps) {
  const [first] = getContactChannels(locale)
  if (first?.id === 'whatsapp') {
    return (
      <a className={className} href={first.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return (
    <a className={className} href="#contato">
      {children}
    </a>
  )
}
