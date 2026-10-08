import type { HomeContent } from '@/lib/site/content'

export function FeatureLedger({ content }: { content: HomeContent }) {
  const { features } = content
  return (
    <section id="features" className="site-section" aria-labelledby="features-title">
      <div className="site-wrap">
        <span className="site-eyebrow">{features.eyebrow}</span>
        <h2 id="features-title" className="site-h2">
          {features.title}
        </h2>
        <ol className="ledger">
          {features.items.map((item, index) => (
            <li key={item.title} className="ledger__row">
              <span className="ledger__num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="ledger__title">{item.title}</h3>
                <p className="ledger__body">{item.body}</p>
              </div>
              <span className="ledger__note">{item.note}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
