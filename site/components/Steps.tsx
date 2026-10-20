import type { HomeContent } from '@/lib/content'

export function Steps({ content }: { content: HomeContent }) {
  const { steps } = content
  return (
    <section className="vd-section vd-section--gray" id="como-funciona" aria-labelledby="h-how">
      <div className="vd-container">
        <div className="vd-head">
          <h2 id="h-how">{steps.title}</h2>
          <p>{steps.subtitle}</p>
        </div>
        <ol className="jl-steps vd-steps">
          {steps.items.map((item, index) => (
            <li key={item.title} className="vd-step">
              <span className="vd-num" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
