import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { IconArrowRight, IconPackage, IconZap } from './Icons'
import { TrialCta } from './TrialCta'

function PosMockup({ content }: { content: HomeContent }) {
  const { mock } = content
  return (
    <div className="vd-mock" role="img" aria-label={mock.aria}>
      <div className="vd-dots" aria-hidden="true">
        <i className="r" />
        <i className="y" />
        <i className="g" />
      </div>
      <div className="vd-stack" aria-hidden="true">
        {mock.items.map((item) => (
          <div key={item.sku} className="vd-mock-row">
            <div className="vd-row-left">
              <span className="vd-ic-sm">
                <IconPackage size={20} />
              </span>
              <div>
                <p className="vd-row-name">{item.name}</p>
                <p className="vd-row-sub">{item.sku}</p>
              </div>
            </div>
            <p className="vd-row-price">{item.price}</p>
          </div>
        ))}
        <div className="vd-mock-total">
          <div className="vd-total-line">
            <span>{mock.totalLabel}</span>
            <b>{mock.total}</b>
          </div>
          <span className="vd-mock-finish">{mock.finish}</span>
        </div>
      </div>
    </div>
  )
}

export function Hero({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { hero } = content
  return (
    <section className="vd-hero" id="inicio" aria-labelledby="h-hero">
      <div className="vd-container vd-hero-grid">
        <div>
          <span className="vd-pill">
            <IconZap />
            {hero.badge}
          </span>
          <h1 id="h-hero">
            {hero.h1.line1}
            <br />
            <span className="vd-brand">{hero.h1.line2}</span>
          </h1>
          <p className="vd-hero-lead">{hero.lead}</p>
          <div className="vd-hero-ctas">
            <TrialCta locale={locale} className="vd-btn vd-btn--primary vd-btn--lg">
              {hero.ctaPrimary}
              <IconArrowRight />
            </TrialCta>
            <a className="vd-btn vd-btn--outline vd-btn--lg" href="#como-funciona">
              {hero.ctaSecondary}
            </a>
          </div>
          <p className="vd-micro">{hero.microcopy}</p>
        </div>
        <PosMockup content={content} />
      </div>
    </section>
  )
}
