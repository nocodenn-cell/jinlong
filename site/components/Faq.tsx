import type { HomeContent } from '@/lib/content'

/** Perguntas frequentes em <details>: funciona sem JavaScript e é acessível por teclado. */
export function Faq({ content }: { content: HomeContent }) {
  const { faq } = content
  return (
    <section className="jl-section" id="perguntas" aria-labelledby="h-faq">
      <div className="jl-wrap jl-faq-wrap">
        <span className="jl-eyebrow">{faq.eyebrow}</span>
        <h2 className="jl-h2" id="h-faq">
          {faq.title}
        </h2>
        <div className="jl-faq">
          {faq.items.map((item) => (
            <details key={item.q}>
              <summary>
                <h3>{item.q}</h3>
                <span className="jl-faq-mark" aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
