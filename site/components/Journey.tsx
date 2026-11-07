import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { WholesaleSimulator } from './WholesaleSimulator'

/** "O atacado entra. A confusão sai." — simulador de preço por quantidade. */
export function Journey({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { wholesale: w } = content
  return (
    <section className="jl-journey" id="atacado" aria-labelledby="h-journey">
      <div className="jl-wrap jl-journey-grid">
        <div className="jl-journey-copy">
          <p className="jl-overline">04 / {w.eyebrow}</p>
          <h2 id="h-journey">
            {w.title}
            <br />
            <em>{w.emphasis}</em>
          </h2>
          <p>{w.lead}</p>
          <div className="jl-journey-rule">
            <span>{w.ruleLabel}</span>
            <strong>{w.product}</strong>
            <small>{w.ruleNote}</small>
          </div>
        </div>
        <WholesaleSimulator locale={locale} copy={w} />
      </div>
    </section>
  )
}
