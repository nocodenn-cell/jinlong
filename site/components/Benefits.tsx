import type { HomeContent } from '@/lib/content'
import { IconCart, IconLanguages, IconPackage, IconTag } from './Icons'

const ICONS = [IconCart, IconPackage, IconTag, IconLanguages]

export function Benefits({ content }: { content: HomeContent }) {
  const { benefits } = content
  return (
    <section id="beneficios" className="vd-section" aria-labelledby="h-ben">
      <div className="vd-container">
        <div className="vd-head">
          <h2 id="h-ben">{benefits.title}</h2>
          <p>{benefits.subtitle}</p>
        </div>
        <div className="vd-benefits">
          {benefits.items.map((item, index) => {
            const Icon = ICONS[index % ICONS.length]
            return (
              <article key={item.title} className="vd-benefit">
                <div className="vd-ic-lg">
                  <Icon size={32} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
