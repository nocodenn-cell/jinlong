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
  hasContact: boolean
}

function buildLinks(content: HomeContent, hasContact: boolean): MenuLink[] {
  const { nav } = content
  const links: MenuLink[] = [
    { href: '#inicio', label: nav.home },
    { href: '#funcionalidades', label: nav.features },
    { href: '#demonstracao', label: nav.demo },
    { href: '#como-funciona', label: nav.how },
  ]
  return hasContact ? [...links, { href: '#contato', label: nav.contact }] : links
}

export function SiteHeader({ locale, content, showSwitch, hasContact }: SiteHeaderProps) {
  const { nav } = content
  const links = buildLinks(content, hasContact)
  const loginHref = erpHref('/login')
  return (
    <header className="jl-nav">
      <Brand locale={locale} label={content.brandLabel} />
      <nav aria-label={nav.label}>
        <ul>
          {links.map((link, index) => (
            <li key={link.href}>
              <a href={link.href} aria-current={index === 0 ? 'page' : undefined}>
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
