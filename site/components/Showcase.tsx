import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { CommandCenter } from './CommandCenter'

export function Showcase({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const cc = content.commandCenter
  return (
    <section className="jl-showcase" id="experiencia" aria-labelledby="h-showcase">
      <div className="jl-wrap">
        <div className="jl-showcase-intro">
          <div>
            <p className="jl-overline jl-gold">02 / {cc.eyebrow}</p>
            <h2 id="h-showcase">
              {cc.title}
              <br />
              <em>{cc.emphasis}</em>
            </h2>
          </div>
          <p>{cc.lead}</p>
        </div>
        <CommandCenter locale={locale} copy={cc} />
        <p className="jl-showcase-foot">{cc.hint}</p>
      </div>
    </section>
  )
}
