import type { HomeContent } from '@/lib/content'
import { Ph } from './Placeholder'

export function Niches({ content }: { content: HomeContent }) {
  const { niches } = content
  return (
    <section className="jl-section jl-section--tight" id="mendian" aria-labelledby="h-niches">
      <div className="jl-wrap">
        <h2 className="jl-h2" id="h-niches">{niches.title}</h2>
        <p className="jl-lead">{niches.lead}</p>
        <ul className="jl-niches">
          {niches.items.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p><Ph text={item.body} /></p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
