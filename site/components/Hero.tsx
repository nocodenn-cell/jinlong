import type { HomeContent } from '@/lib/content'

/** Abertura cinematográfica: tudo decorativo é CSS (sem imagens nem JavaScript). */
export function Hero({ content }: { content: HomeContent }) {
  const { hero } = content
  return (
    <section className="jl-hero" id="inicio" aria-labelledby="h-hero">
      <div className="jl-hero-fx" aria-hidden="true">
        <span className="jl-hero-noise" />
        <span className="jl-hero-beam" />
        <span className="jl-hero-glyph" lang="zh-CN">
          龍
        </span>
        <span className="jl-orbit jl-orbit--1" />
        <span className="jl-orbit jl-orbit--2" />
      </div>
      <div className="jl-wrap jl-hero-content">
        <p className="jl-hero-label">
          <span className="jl-gold-line" aria-hidden="true" />
          {hero.label}
          <span className="jl-hero-index" aria-hidden="true">
            01 / 05
          </span>
        </p>
        <div className="jl-hero-headline">
          <h1 id="h-hero">
            <span>{hero.h1.line1}</span>
            <i>{hero.h1.line2}</i>
            <span>{hero.h1.line3}</span>
          </h1>
          <div className="jl-hero-side">
            <span className="jl-vline" aria-hidden="true" />
            <p>{hero.lead}</p>
            <a className="jl-cta-gold" href="#contato">
              <span>{hero.ctaPrimary}</span>
              <b aria-hidden="true">↗</b>
            </a>
            <a className="jl-quiet-link" href="#experiencia">
              {hero.ctaSecondary} <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <p className="jl-hero-statement">
          <span className="jl-hero-kanji" lang="zh-CN" aria-hidden="true">
            金
          </span>
          {hero.statement}
        </p>
      </div>
      <div className="jl-hero-bottom" aria-hidden="true">
        <div className="jl-wrap">
          {hero.bottom.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
