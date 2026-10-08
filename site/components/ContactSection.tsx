import type { HomeContent } from '@/lib/content'
import { getContactChannels, type ContactChannel } from '@/lib/contactChannels'
import type { SiteLocale } from '@/lib/locales'

interface ContactSectionProps {
  locale: SiteLocale
  content: HomeContent
}

function ChannelCard({
  channel,
  content,
  primary,
}: {
  channel: ContactChannel
  content: HomeContent
  primary: boolean
}) {
  const copy = content.contact.channels
  const cardClass = `contact__card${primary ? ' contact__card--primary' : ''}`

  if (channel.id === 'whatsapp') {
    return (
      <li className={cardClass}>
        <a
          href={channel.href}
          target="_blank"
          rel="noopener noreferrer"
          className="site-btn site-btn--primary"
        >
          {copy.whatsapp}
          <span className="site-vh"> ({copy.open})</span>
        </a>
      </li>
    )
  }

  return (
    <li className={cardClass}>
      <span className="contact__id-label">
        {copy.wechat} · {copy.wechatIdLabel}
      </span>
      <span className="contact__id" lang="en">
        {channel.wechatId}
      </span>
    </li>
  )
}

export function ContactSection({ locale, content }: ContactSectionProps) {
  const { contact } = content
  const channels = getContactChannels(locale)
  return (
    <section id="contact" className="site-section" aria-labelledby="contact-title">
      <div className="site-wrap contact">
        <div>
          <span className="site-eyebrow">{contact.eyebrow}</span>
          <h2 id="contact-title" className="site-h2">
            {contact.title}
          </h2>
          <p className="contact__lead">{contact.lead}</p>
        </div>
        {channels.length > 0 ? (
          <ul className="contact__list">
            {channels.map((channel, index) => (
              <ChannelCard key={channel.id} channel={channel} content={content} primary={index === 0} />
            ))}
          </ul>
        ) : (
          <p className="contact__unavailable">{contact.unavailable}</p>
        )}
      </div>
    </section>
  )
}
