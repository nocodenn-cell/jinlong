import type { HomeContent } from '@/lib/content'
import { getContactChannels } from '@/lib/contactChannels'
import { erpHref } from '@/lib/erpLinks'
import { isDraftChineseVisible } from '@/lib/publication'
import type { SiteLocale } from '@/lib/locales'
import { Brand } from './Brand'

function ContactColumn({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { contact, footer } = content
  return (
    <div>
      <h3>{footer.contactTitle}</h3>
      <ul>
        {getContactChannels(locale).map((channel) =>
          channel.id === 'whatsapp' ? (
            <li key="whatsapp">
              <a className="jl-contact-link" href={channel.href} target="_blank" rel="noopener noreferrer">
                {contact.whatsapp}
                <span className="visually-hidden"> ({contact.opensNewTab})</span>
              </a>
            </li>
          ) : (
            <li key="wechat">
              <span className="jl-wechat-label">{contact.wechatIdLabel}</span>
              <span className="jl-wechat-id">{channel.wechatId}</span>
            </li>
          )
        )}
      </ul>
    </div>
  )
}

function LegalColumn({ content }: { content: HomeContent }) {
  const { footer } = content
  const suffix = footer.ptOnly ? <span lang="zh-CN"> {footer.ptOnly}</span> : null
  return (
    <div>
      <h3>{footer.legalTitle}</h3>
      <ul>
        <li>
          <a href={erpHref('/privacidade')} hrefLang="pt-BR">
            {footer.privacy}
            {suffix}
          </a>
        </li>
        <li>
          <a href={erpHref('/termos')} hrefLang="pt-BR">
            {footer.terms}
            {suffix}
          </a>
        </li>
        <li>
          <a href={erpHref('/login')}>{footer.login}</a>
        </li>
      </ul>
    </div>
  )
}

export function SiteFooter({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { footer } = content
  const hasContact = getContactChannels(locale).length > 0
  return (
    <footer className="jl-footer" id="contato">
      <div className={hasContact ? 'jl-wrap jl-footer-grid' : 'jl-wrap jl-footer-grid jl-footer-grid--no-contact'}>
        <div>
          <Brand locale={locale} label={content.brandLabel} />
          <p style={{ marginTop: 16 }}>{footer.tagline}</p>
        </div>
        {hasContact && <ContactColumn locale={locale} content={content} />}
        <LegalColumn content={content} />
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
