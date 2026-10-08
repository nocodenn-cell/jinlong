import type { HomeContent } from '@/lib/site/content'

export function JourneySection({ content }: { content: HomeContent }) {
  const { journey } = content
  return (
    <section id="journey" className="site-section site-section--deep" aria-labelledby="journey-title">
      <div className="site-wrap">
        <span className="site-eyebrow">{journey.eyebrow}</span>
        <h2 id="journey-title" className="site-h2">
          {journey.title}
        </h2>
        <p className="journey__lead">{journey.lead}</p>
        <ol className="journey">
          {journey.steps.map((step) => (
            <li key={step.title} className="journey__step">
              <h3 className="journey__title">{step.title}</h3>
              <p className="journey__body">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
