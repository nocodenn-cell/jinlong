import type { HomeContent } from '@/lib/content'
import { Ph } from './Placeholder'

export function Price({ content }: { content: HomeContent }) {
  const { price } = content
  return (
    <section className="jl-section jl-section--alt jl-section--tight" id="jiage" aria-labelledby="h-price">
      <div className="jl-wrap">
        <h2 className="jl-h2" id="h-price">{price.title}</h2>
        <div className="jl-price">
          <h3>{price.plan}</h3>
          <p className="jl-price-value"><Ph text={price.value} /></p>
          <ul>
            {price.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <a className="jl-btn jl-btn--primary" href="#shiyong">{price.cta}</a>
        </div>
      </div>
    </section>
  )
}
