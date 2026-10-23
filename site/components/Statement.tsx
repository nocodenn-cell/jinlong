import type { HomeContent } from '@/lib/content'
import { isDraftChineseVisible } from '@/lib/publication'

/** "A nova forma de gerir": problema, para quem e o trilho de palavras. */
export function Statement({ content }: { content: HomeContent }) {
  const { statement } = content
  const words = isDraftChineseVisible() ? [...statement.rail, ...statement.railZh] : [...statement.rail]
  const rail = [...words, ...words, ...words]
  return (
    <section className="jl-statement" id="visao" aria-labelledby="h-statement">
      <div className="jl-wrap jl-statement-grid">
        <p className="jl-tiny-title">
          <span>01</span> / {statement.eyebrow}
        </p>
        <div>
          <h2 id="h-statement">
            {statement.title} <em>{statement.emphasis}</em>
          </h2>
          <p className="jl-statement-body">{statement.body}</p>
        </div>
      </div>
      <div className="jl-wrap jl-statement-detail">
        <div>
          <h3 className="jl-detail-title">{statement.problemsTitle}</h3>
          <ol className="jl-problems">
            {statement.problems.map((item, index) => (
              <li key={item.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="jl-audience">
          <h3 className="jl-detail-title">{statement.audienceTitle}</h3>
          <ul>
            {statement.audience.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{statement.audienceNote}</p>
        </div>
      </div>
      <div className="jl-rail" aria-hidden="true">
        <div>
          {rail.map((word, index) => (
            <span key={`${word}-${index}`} lang={/[㐀-鿿]/.test(word) ? 'zh-CN' : undefined}>
              {word} /
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
