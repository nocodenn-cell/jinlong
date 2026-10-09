import type { HomeContent } from '@/lib/content'
import { isDraftChineseVisible } from '@/lib/publication'
import type { SiteLocale } from '@/lib/locales'
import { PdvWindow } from './PdvWindow'
import { Mixed } from './Mixed'
import { TrialCta, hasContactChannel } from './TrialCta'

interface HeroProps {
  locale: SiteLocale
  content: HomeContent
}

function Chip({ content }: { content: HomeContent }) {
  const { chipFirst, chipSecond } = content.hero
  return (
    <span className="jl-chip">
      <span lang={chipFirst.lang}>{chipFirst.text}</span>
      <span className="x" aria-hidden="true">
        ⇄
      </span>
      <span lang={chipSecond.lang}>{chipSecond.text}</span>
    </span>
  )
}

export function Hero({ locale, content }: HeroProps) {
  const { hero } = content
  const showChinese = isDraftChineseVisible()
  const hasTrial = hasContactChannel(locale)
  return (
    <section className="jl-hero" id="inicio" aria-labelledby="h-hero">
      <div className="jl-hero-copy">
        {showChinese && (
          <span className="jl-sig" lang="zh-CN">
            {hero.signature}
          </span>
        )}
        <h1 id="h-hero">
          {hero.h1.line1}
          <br />
          <span className="light">{hero.h1.line2}</span>
          <br />
          <em>{hero.h1.emphasis}</em>
          {hero.h1.rest}
        </h1>
        <p className="jl-lead">{hero.lead}</p>
        <div className="jl-hero-ctas">
          <a className="jl-btn jl-btn--primary" href="#demonstracao">
            {hero.ctaDemo}
            <span className="jl-arrow" aria-hidden="true">
              →
            </span>
          </a>
          <TrialCta locale={locale} label={hero.ctaTrial} />
        </div>
        {hasTrial && <span className="jl-btn-note">{hero.trialNote}</span>}
        <ul className="jl-proof">
          {hero.proof.map((item) => (
            <li key={item}>
              <Mixed text={item} locale={locale} />
            </li>
          ))}
        </ul>
      </div>
      <div className="jl-hero-stage">
        {showChinese && <Chip content={content} />}
        <PdvWindow locale={locale} copy={content.pdv} />
        <div className="jl-float" aria-hidden="true">
          <div className="k">{hero.floatTitle}</div>
          <div className="v">
            <b>R$ 18,50</b>
            <s>R$ 22,90</s>
          </div>
          <p>{hero.floatNote}</p>
        </div>
      </div>
    </section>
  )
}
