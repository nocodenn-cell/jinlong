import type { HomeContent } from '@/lib/content'
import { Ph } from './Placeholder'

/** Perguntas frequentes em <details>: funciona sem JavaScript e por teclado. */
export function Faq({ content }: { content: HomeContent }) {
  const { faq } = content
  return (
    <section className="jl-section jl-section--tight" id="wenti" aria-labelledby="h-faq">
      <div className="jl-wrap jl-faq-wrap">
        <h2 className="jl-h2" id="h-faq">{faq.title}</h2>
        <div className="jl-faq">
          {faq.items.map((item) => (
            <details key={item.q}>
              <summary>
                <h3>{item.q}</h3>
                <span className="jl-faq-mark" aria-hidden="true" />
              </summary>
              <p><Ph text={item.a} /></p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
