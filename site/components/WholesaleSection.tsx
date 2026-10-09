import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { WholesaleSimulator } from './WholesaleSimulator'

export function WholesaleSection({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { wholesale } = content
  return (
    <section className="jl-section jl-section--alt" id="demonstracao" aria-labelledby="h-wh">
      <div className="jl-wrap jl-wh">
        <div>
          <span className="jl-eyebrow">{wholesale.eyebrow}</span>
          <h2 className="jl-h2" id="h-wh">
            {wholesale.title}
          </h2>
          <p className="jl-lead">{wholesale.lead}</p>
          <p className="jl-review" style={{ fontSize: 16 }}>
            {wholesale.hint}
          </p>
        </div>
        <WholesaleSimulator locale={locale} copy={wholesale} />
      </div>
    </section>
  )
}
