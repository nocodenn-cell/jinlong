import type { HomeContent } from '@/lib/content'

/** "Conheça antes de decidir": como pedir a demonstração e o que acontece depois. */
export function NextStep({ content }: { content: HomeContent }) {
  const { process: p } = content
  return (
    <section className="jl-next" id="como-funciona" aria-labelledby="h-next">
      <div className="jl-wrap">
        <p className="jl-overline jl-gold">{p.eyebrow}</p>
        <div className="jl-next-grid">
          <h2 id="h-next">
            {p.title}
            <br />
            <em>{p.emphasis}</em>
          </h2>
          <div>
            <p>{p.lead}</p>
            <a href="#contato" className="jl-cta-gold">
              <span>{p.cta}</span>
              <b aria-hidden="true">↗</b>
            </a>
          </div>
        </div>
        <ol className="jl-next-steps">
          {p.steps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
