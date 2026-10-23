import type { HomeContent } from '@/lib/content'
import { erpHref } from '@/lib/erpLinks'
import { sitePath, type SiteLocale } from '@/lib/locales'
import { Brand } from './Brand'
import { LanguageSwitch } from './LanguageSwitch'
import { MobileMenu, type MenuLink } from './MobileMenu'

interface SiteHeaderProps {
  locale: SiteLocale
  content: HomeContent
  showSwitch: boolean
  /** Em páginas internas as âncoras apontam para a home. */
  anchorsOnHome?: boolean
}

function buildLinks(content: HomeContent, prefix: string): MenuLink[] {
  const { nav } = content
  return [
    { href: `${prefix}#visao`, label: nav.vision },
    { href: `${prefix}#experiencia`, label: nav.experience },
    { href: `${prefix}#operacao`, label: nav.operation },
    { href: `${prefix}#perguntas`, label: nav.faq },
  ]
}

export function SiteHeader({ locale, content, showSwitch, anchorsOnHome = false }: SiteHeaderProps) {
  const { nav } = content
  const prefix = anchorsOnHome ? sitePath(locale) : ''
  const links = buildLinks(content, prefix)
  return (
    <header className="jl-nav">
      <div className="jl-wrap jl-nav-inner">
        <Brand locale={locale} label={content.brandLabel} tagline={content.brandTagline} />
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
          <a className="jl-nav-cta" href={`${prefix}#contato`}>
            {nav.cta}
            <span aria-hidden="true">↗</span>
          </a>
          <MobileMenu
            links={[...links, { href: `${prefix}#contato`, label: nav.demo }]}
            loginHref={erpHref('/login')}
            loginLabel={nav.login}
            openLabel={nav.menuOpen}
            closeLabel={nav.menuClose}
          />
        </div>
      </div>
    </header>
  )
}
