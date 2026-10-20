import type { HomeContent } from '@/lib/content'

/** Seção discreta de funcionalidades e integrações. Integração fiscal: só "em avaliação". */
export function Integrations({ content }: { content: HomeContent }) {
  const { integrations } = content
  return (
    <section className="jl-section jl-section--tight jl-integrations" id="gongneng" aria-labelledby="h-int">
      <div className="jl-wrap">
        <h2 className="jl-h3" id="h-int">{integrations.title}</h2>
        <ul>
          {integrations.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="jl-int-note">{integrations.note}</p>
      </div>
    </section>
  )
}
