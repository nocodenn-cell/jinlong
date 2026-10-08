'use client'

import type { MouseEvent } from 'react'
import { SITE_LOCALE_COOKIE, sitePath, toLegacyIdioma, type SiteLocale } from '@/lib/locales'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

interface SwitchCopy {
  group: string
  pt: string
  ptShort: string
  zh: string
  zhShort: string
}

interface LanguageSwitchProps {
  current: SiteLocale
  copy: SwitchCopy
}

const OPTIONS: ReadonlyArray<{ locale: SiteLocale; full: keyof SwitchCopy; short: keyof SwitchCopy }> = [
  { locale: 'pt-BR', full: 'pt', short: 'ptShort' },
  { locale: 'zh-CN', full: 'zh', short: 'zhShort' },
]

function remember(locale: SiteLocale, event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  document.cookie = `${SITE_LOCALE_COOKIE}=${toLegacyIdioma(locale)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`
  window.location.assign(`${sitePath(locale)}${window.location.hash}`)
}

/** Links reais com hreflang (funcionam sem JS); o clique persiste a escolha e mantém a âncora. */
export function LanguageSwitch({ current, copy }: LanguageSwitchProps) {
  return (
    <div className="jl-lang" role="group" aria-label={copy.group}>
      {OPTIONS.map(({ locale, full, short }) => {
        const content = (
          <>
            <span className="full">{copy[full]}</span>
            <span className="short">{copy[short]}</span>
          </>
        )
        return locale === current ? (
          <span key={locale} lang={locale} aria-current="true">
            {content}
          </span>
        ) : (
          <a key={locale} href={sitePath(locale)} lang={locale} hrefLang={locale} onClick={(event) => remember(locale, event)}>
            {content}
          </a>
        )
      })}
    </div>
  )
}
