import type { HomeContent } from '@/lib/content'

export function Pains({ content }: { content: HomeContent }) {
  const { pains } = content
  return (
    <section className="jl-section jl-section--alt jl-section--tight" aria-labelledby="h-pains">
      <div className="jl-wrap">
        <h2 className="jl-h2" id="h-pains">{pains.title}</h2>
        <div className="jl-pains">
          {pains.items.map((item) => (
            <article key={item.pain}>
              <h3>{item.pain}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
