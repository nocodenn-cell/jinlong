'use client'

import Link from 'next/link'
import {
  SITE_LOCALE_COOKIE,
  sitePath,
  toLegacyIdioma,
  type SiteLocale,
} from '@/lib/locales'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

interface LocaleSwitchProps {
  target: SiteLocale
  label: string
  ariaLabel: string
}

/** Link real (funciona sem JS); o clique apenas persiste a preferência. */
export function LocaleSwitch({ target, label, ariaLabel }: LocaleSwitchProps) {
  const rememberChoice = () => {
    document.cookie = `${SITE_LOCALE_COOKIE}=${toLegacyIdioma(target)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`
  }

  return (
    <Link
      href={sitePath(target)}
      hrefLang={target}
      lang={target}
      className="site-lang"
      aria-label={`${ariaLabel}: ${label}`}
      onClick={rememberChoice}
    >
      {label}
    </Link>
  )
}
