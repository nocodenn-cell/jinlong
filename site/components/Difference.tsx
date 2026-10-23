import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { isDraftChineseVisible } from '@/lib/publication'

export function Difference({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { difference: d } = content
  // Na página em português, a frase em chinês só aparece depois da revisão nativa (em produção).
  const zhPhrase = locale === 'zh-CN' || isDraftChineseVisible() ? d.artZh : '简体中文'
  return (
    <section className="jl-difference" id="operacao" aria-labelledby="h-difference">
      <div className="jl-wrap jl-difference-grid">
        <div className="jl-difference-art" aria-hidden="true">
          <span className="jl-outline-glyph" lang="zh-CN">
            龍
          </span>
          <span className="jl-coordinate">
            {d.artCoordinate[0]}
            <br />
            {d.artCoordinate[1]}
          </span>
          <div className="jl-glass">
            <span>{d.artLabel}</span>
            <div className="jl-pair">
              <b lang="pt-BR">{d.artPt}</b>
              <span>⇄</span>
              <b lang="zh-CN">{zhPhrase}</b>
            </div>
            <p>{d.artNote}</p>
          </div>
        </div>
        <div className="jl-difference-copy">
          <p className="jl-overline jl-gold">03 / {d.eyebrow}</p>
          <h2 id="h-difference">
            {d.title[0]}
            <br />
            {d.title[1]}
            <br />
            <em>{d.emphasis}</em>
          </h2>
          <p>{d.body}</p>
          <ul>
            {d.items.map((item, index) => (
              <li key={item.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </div>
              </li>
            ))}
          </ul>
          <a href="#contato" className="jl-underlined">
            {d.link} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  )
}
