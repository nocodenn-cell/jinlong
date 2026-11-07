import type { HomeContent } from '@/lib/content'

/** Perguntas com <details>: abre por teclado e sem JavaScript. */
export function Faq({ content }: { content: HomeContent }) {
  const { faq } = content
  return (
    <section className="jl-questions" id="perguntas" aria-labelledby="h-faq">
      <div className="jl-wrap jl-questions-grid">
        <div>
          <p className="jl-overline">{faq.eyebrow}</p>
          <h2 id="h-faq">{faq.title}</h2>
        </div>
        <div className="jl-accordion">
          {faq.items.map((item, index) => (
            <details key={item.q} open={index === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
