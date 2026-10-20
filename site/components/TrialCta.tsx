import type { ReactNode } from 'react'
import { getContactChannels } from '@/lib/contactChannels'
import type { SiteLocale } from '@/lib/locales'

interface TrialCtaProps {
  locale: SiteLocale
  className: string
  children: ReactNode
}

/** CTA de teste: abre o WhatsApp quando configurado; senão, e-mail (mailto) para a equipe. */
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
    <a className={className} href={first?.href}>
      {children}
    </a>
  )
}
