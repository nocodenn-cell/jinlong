import type { HomeContent } from '@/lib/content'
import { CONTACT_EMAIL, getContactChannels } from '@/lib/contactChannels'
import type { SiteLocale } from '@/lib/locales'
import { TrialForm } from './TrialForm'

export function FinalCta({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { final } = content
  const whatsapp = getContactChannels(locale).find((channel) => channel.id === 'whatsapp')?.href ?? null
  return (
    <section className="jl-final" id="contato" aria-labelledby="h-final">
      <div className="jl-wrap jl-final-grid">
        <div>
          <p className="jl-overline jl-gold">05 / {final.eyebrow}</p>
          <h2 id="h-final">
            {final.title}
            <br />
            <em>{final.emphasis}</em>
          </h2>
          <p className="jl-final-lead">{final.lead}</p>
          <p className="jl-contact-lines">
            {final.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
        </div>
        <TrialForm copy={content.form} email={CONTACT_EMAIL} whatsappHref={whatsapp} locale={locale} />
      </div>
    </section>
  )
}
