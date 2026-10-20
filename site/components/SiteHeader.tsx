import type { HomeContent } from '@/lib/content'
import { erpHref } from '@/lib/erpLinks'
import type { SiteLocale } from '@/lib/locales'
import { Brand } from './Brand'
import { LanguageSwitch } from './LanguageSwitch'
import { MobileMenu, type MenuLink } from './MobileMenu'
import { TrialCta } from './TrialCta'

interface SiteHeaderProps {
  locale: SiteLocale
  content: HomeContent
  showSwitch: boolean
}

export function SiteHeader({ locale, content, showSwitch }: SiteHeaderProps) {
  const { nav } = content
  const links: MenuLink[] = [
    { href: '#beneficios', label: nav.benefits },
    { href: '#como-funciona', label: nav.how },
    { href: '#painel', label: nav.panel },
  ]
  const loginHref = erpHref('/login')
  return (
    <header className="jl-nav">
      <div className="vd-container vd-nav-row">
        <Brand locale={locale} label={content.brandLabel} />
        <nav aria-label={nav.label}>
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="jl-nav-right">
          {showSwitch && <LanguageSwitch current={locale} copy={content.langSwitch} />}
          <a className="vd-btn vd-btn--ghost vd-btn--sm vd-hide-mobile" href={loginHref}>
            {nav.login}
          </a>
          <TrialCta locale={locale} className="vd-btn vd-btn--primary vd-btn--sm vd-hide-mobile">
            {nav.cta}
          </TrialCta>
          <MobileMenu
            links={links}
            loginHref={loginHref}
            loginLabel={nav.login}
            openLabel={nav.menuOpen}
            closeLabel={nav.menuClose}
          />
        </div>
      </div>
    </header>
  )
}
