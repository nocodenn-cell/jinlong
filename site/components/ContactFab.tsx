import type { HomeContent } from '@/lib/content'
import { getContactChannels } from '@/lib/contactChannels'
import type { SiteLocale } from '@/lib/locales'

/**
 * Botão flutuante de contato (sem JavaScript: <details>). WhatsApp quando configurado + e-mail.
 * [CONFIRMAR: WeChat] — sem conta de WeChat ainda; o canal fica oculto até existir.
 */
export function ContactFab({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { contact } = content
  return (
    <details className="jl-fab">
      <summary aria-label={contact.fab}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        <span aria-hidden="true">{contact.fab}</span>
      </summary>
      <ul>
        {getContactChannels(locale).map((channel) =>
          channel.id === 'whatsapp' ? (
            <li key="whatsapp">
              <a href={channel.href} target="_blank" rel="noopener noreferrer">
                {contact.whatsapp}
                <span className="visually-hidden"> ({contact.opensNewTab})</span>
              </a>
            </li>
          ) : (
            <li key="email">
              <a href={channel.href}>{contact.email}</a>
            </li>
          )
        )}
      </ul>
    </details>
  )
}
