import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { TrialCta } from './TrialCta'

export function FinalCta({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { final, hero } = content
  return (
    <section className="jl-final" aria-labelledby="h-final">
      <span className="jl-sig" lang="zh-CN">
        金龙
      </span>
      <h2 id="h-final">{final.title}</h2>
      <p>{final.lead}</p>
      <div className="jl-hero-ctas">
        <a className="jl-btn jl-btn--primary" href="#demonstracao">
          {hero.ctaDemo}
          <span className="jl-arrow" aria-hidden="true">
            →
          </span>
        </a>
        <TrialCta locale={locale} label={hero.ctaTrial} />
      </div>
    </section>
  )
}
