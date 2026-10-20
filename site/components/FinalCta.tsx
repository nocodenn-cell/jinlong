import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { IconArrowRight, IconCheckCircle } from './Icons'
import { TrialCta } from './TrialCta'

export function FinalCta({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { final } = content
  return (
    <section className="vd-final" aria-labelledby="h-final">
      <div className="vd-container vd-container--narrow">
        <h2 id="h-final">{final.title}</h2>
        <p>{final.lead}</p>
        <TrialCta locale={locale} className="vd-btn vd-btn--white vd-btn--lg">
          {final.cta}
          <IconArrowRight />
        </TrialCta>
        <ul className="vd-checks">
          {final.checks.map((check) => (
            <li key={check}>
              <IconCheckCircle />
              <span>{check}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
