import Link from 'next/link'
import type { HomeContent } from '@/lib/content'
import { erpHref } from '@/lib/erpLinks'
import { otherSiteLocale, sitePath, type SiteLocale } from '@/lib/locales'
import { LocaleSwitch } from './LocaleSwitch'

interface SiteHeaderProps {
  locale: SiteLocale
  content: HomeContent
  showSwitch: boolean
}

export function SiteHeader({ locale, content, showSwitch }: SiteHeaderProps) {
  const { nav, locale: localeCopy } = content
  return (
    <header className="site-header">
      <div className="site-wrap site-header__row">
        <Link href={sitePath(locale)} className="site-brand" aria-label="Jinlong 金龙">
          <span className="site-seal" aria-hidden="true">金</span>
          <span className="site-wordmark" aria-hidden="true">Jinlong</span>
        </Link>
        <nav className="site-nav" aria-label={nav.menuLabel}>
          <a href="#features">{nav.features}</a>
          <a href="#demo">{nav.demo}</a>
          <a href="#journey">{nav.journey}</a>
          <a href="#contact">{nav.contact}</a>
        </nav>
        <div className="site-header__tools">
          {showSwitch && (
            <LocaleSwitch
              target={otherSiteLocale(locale)}
              label={localeCopy.other}
              ariaLabel={localeCopy.switchLabel}
            />
          )}
          <a href={erpHref('/login')} className="site-login">
            {nav.login}
          </a>
        </div>
      </div>
    </header>
  )
}
