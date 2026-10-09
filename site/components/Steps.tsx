import type { HomeContent } from '@/lib/content'

export function Steps({ content }: { content: HomeContent }) {
  const { steps } = content
  return (
    <section className="jl-section jl-section--alt" id="como-funciona" aria-labelledby="h-how">
      <div className="jl-wrap">
        <span className="jl-eyebrow">{steps.eyebrow}</span>
        <h2 className="jl-h2" id="h-how">
          {steps.title}
        </h2>
        <ol className="jl-steps">
          {steps.items.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
