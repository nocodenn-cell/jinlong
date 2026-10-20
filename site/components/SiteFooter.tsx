import type { HomeContent } from '@/lib/content'
import { getContactChannels } from '@/lib/contactChannels'
import { erpHref } from '@/lib/erpLinks'
import type { SiteLocale } from '@/lib/locales'
import { Brand } from './Brand'

function ContactList({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { contact } = content
  const channels = getContactChannels(locale)
  // TODO(contato): WhatsApp/WeChat só aparecem com NEXT_PUBLIC_SITE_WHATSAPP_URL / NEXT_PUBLIC_SITE_WECHAT_ID.
  if (channels.length === 0) return <li>{contact.soon}</li>
  return (
    <>
      {channels.map((channel) =>
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
    </>
  )
}

export function SiteFooter({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { footer, nav } = content
  const suffix = footer.ptOnly ? <span lang="zh-CN"> {footer.ptOnly}</span> : null
  return (
    <footer className="vd-footer" id="contato">
      <div className="vd-container">
        <div className="vd-footer-grid">
          <div>
            <Brand locale={locale} label={content.brandLabel} />
            <p className="vd-footer-tag">{footer.tagline}</p>
          </div>
          <div>
            <h3>{footer.productTitle}</h3>
            <ul>
              <li><a href="#beneficios">{nav.benefits}</a></li>
              <li><a href="#como-funciona">{nav.how}</a></li>
              <li><a href="#painel">{nav.panel}</a></li>
            </ul>
          </div>
          <div>
            <h3>{footer.companyTitle}</h3>
            <ul>
              <ContactList locale={locale} content={content} />
            </ul>
          </div>
          <div>
            <h3>{footer.legalTitle}</h3>
            <ul>
              <li><a href={erpHref('/termos')} hrefLang="pt-BR">{footer.terms}{suffix}</a></li>
              <li><a href={erpHref('/privacidade')} hrefLang="pt-BR">{footer.privacy}{suffix}</a></li>
              <li><a href={erpHref('/login')}>{footer.login}</a></li>
            </ul>
          </div>
        </div>
        <div className="vd-footer-bottom">
          <p>
            © 2026 Jinlong <span lang="zh-CN">金龙</span>. {footer.rights}
          </p>
        </div>
      </div>
    </footer>
  )
}
