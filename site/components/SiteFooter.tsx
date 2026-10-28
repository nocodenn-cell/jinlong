import type { HomeContent } from '@/lib/content'
import { getContactChannels } from '@/lib/contactChannels'
import { erpHref } from '@/lib/erpLinks'
import { isDraftChineseVisible } from '@/lib/publication'
import { sitePath, type SiteLocale } from '@/lib/locales'
import { Brand } from './Brand'

export function SiteFooter({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { footer, nav, contact } = content
  const home = sitePath(locale)
  const suffix = footer.ptOnly ? <span lang="zh-CN"> {footer.ptOnly}</span> : null
  return (
    <footer className="jl-footer">
      <div className="jl-wrap jl-footer-main">
        <div>
          <Brand locale={locale} label={content.brandLabel} tagline={content.brandTagline} />
          <p>{footer.tagline}</p>
        </div>
        <div>
          <h2>{footer.exploreTitle}</h2>
          <a href={`${home}#experiencia`}>{nav.experience}</a>
          <a href={`${home}#operacao`}>{nav.operation}</a>
          <a href={`${home}#perguntas`}>{nav.faq}</a>
        </div>
        <div>
          <h2>{footer.contactTitle}</h2>
          {getContactChannels(locale).map((channel) =>
            channel.id === 'whatsapp' ? (
              <a key="whatsapp" href={channel.href} target="_blank" rel="noopener noreferrer">
                {contact.whatsapp} <span aria-hidden="true">↗</span>
                <span className="visually-hidden"> ({contact.opensNewTab})</span>
              </a>
            ) : (
              <a key="email" href={channel.href}>
                {channel.address}
              </a>
            )
          )}
          <a href={`${home}#contato`}>{nav.demo}</a>
        </div>
        <div>
          <h2>{footer.legalTitle}</h2>
          <a href={erpHref('/privacidade')} hrefLang="pt-BR">
            {footer.privacy}
            {suffix}
          </a>
          <a href={erpHref('/termos')} hrefLang="pt-BR">
            {footer.terms}
            {suffix}
          </a>
          <a href={erpHref('/login')}>{footer.login}</a>
        </div>
      </div>
      <div className="jl-wrap jl-footer-bottom">
        <span>
          © Jinlong <span lang="zh-CN">金龙</span>
        </span>
        {isDraftChineseVisible() && <span lang="zh-CN">{footer.zhTagline}</span>}
      </div>
    </footer>
  )
}
