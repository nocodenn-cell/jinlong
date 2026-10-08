import type { HomeContent } from '@/lib/site/content'
import type { SiteLocale } from '@/lib/site/locales'
import { PdvPreview } from './PdvPreview'

/** Quebra preferencial entre orações (evita partir palavras chinesas como 价格). */
function splitPhrases(title: string): string[] {
  return title.split(/(?<=[，。.])\s*/).filter(Boolean)
}

interface HomeHeroProps {
  locale: SiteLocale
  content: HomeContent
}

export function HomeHero({ locale, content }: HomeHeroProps) {
  const { hero, preview } = content
  return (
    <section className="site-hero" aria-labelledby="hero-title">
      <div className="site-wrap site-hero__grid">
        <div>
          <span className="site-eyebrow">{hero.eyebrow}</span>
          <h1 id="hero-title" className="site-h1">
            {splitPhrases(hero.title).map((phrase) => (
              <span key={phrase} className="site-h1__phrase">
                {phrase}
              </span>
            ))}
          </h1>
          <p className="site-lead">{hero.lead}</p>
          <div className="site-actions">
            <a href="#demo" className="site-btn site-btn--primary">
              {hero.ctaPrimary}
            </a>
            <a href="#contact" className="site-btn site-btn--ghost">
              {hero.ctaSecondary}
            </a>
          </div>
          <ul className="site-proof">
            {hero.proof.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div id="demo">
          <PdvPreview locale={locale} copy={preview} />
        </div>
      </div>
    </section>
  )
}
