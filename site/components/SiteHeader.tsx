import type { HomeContent } from '@/lib/content'
import { erpHref } from '@/lib/erpLinks'
import type { SiteLocale } from '@/lib/locales'
import { Brand } from './Brand'
import { LanguageSwitch } from './LanguageSwitch'
import { MobileMenu, type MenuLink } from './MobileMenu'

interface SiteHeaderProps {
  locale: SiteLocale
  content: HomeContent
  showSwitch: boolean
}

function buildLinks(content: HomeContent): MenuLink[] {
  const { nav } = content
  return [
    { href: '#mendian', label: nav.niches },
    { href: '#funcionalidades', label: nav.features },
    { href: '#demonstracao', label: nav.demo },
    { href: '#jiage', label: nav.price },
    { href: '#wenti', label: nav.faq },
    { href: '#contato', label: nav.contact },
  ]
}

export function SiteHeader({ locale, content, showSwitch }: SiteHeaderProps) {
  const { nav } = content
  const links = buildLinks(content)
  const loginHref = erpHref('/login')
  return (
    <header className="jl-nav">
      <Brand locale={locale} label={content.brandLabel} />
      <nav aria-label={nav.label}>
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="jl-nav-right">
        {showSwitch && <LanguageSwitch current={locale} copy={content.langSwitch} />}
        <a className="jl-btn jl-btn--ghost" href={loginHref}>
          {nav.login}
        </a>
        <a className="jl-btn jl-btn--primary jl-btn--sm jl-hide-m" href="#shiyong">
          {nav.cta}
        </a>
        <MobileMenu
          links={links}
          loginHref={loginHref}
          loginLabel={nav.login}
          openLabel={nav.menuOpen}
          closeLabel={nav.menuClose}
        />
      </div>
    </header>
  )
}
