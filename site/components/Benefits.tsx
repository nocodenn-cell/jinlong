import type { ReactNode } from 'react'
import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { Mixed } from './Mixed'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {children}
    </svg>
  )
}

const ICONS: readonly ReactNode[] = [
  <Icon key="sale">
    <path d="M3 4h2l2.4 11h11L21 7H6.2" />
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
  </Icon>,
  <Icon key="stock">
    <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Icon>,
  <Icon key="price">
    <path d="M20 12l-8 8-9-9V3h8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </Icon>,
  <Icon key="finance">
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M16 15h2" />
  </Icon>,
]

export function Benefits({ locale, content }: { locale: SiteLocale; content: HomeContent }) {
  const { benefits } = content
  return (
    <section className="jl-section jl-section--alt" aria-labelledby="h-ben">
      <div className="jl-wrap">
        <span className="jl-eyebrow">{benefits.eyebrow}</span>
        <h2 className="jl-h2" id="h-ben">
          {benefits.title}
        </h2>
        <div className="jl-benefits">
          {benefits.items.map((item, index) => {
            const isLanguage = index === ICONS.length
            return (
              <article key={item.title} className={isLanguage ? 'jl-benefit jl-benefit--lang' : 'jl-benefit'}>
                <div className="ic" lang={isLanguage ? 'zh-CN' : undefined} aria-hidden="true">
                  {isLanguage ? '中' : ICONS[index]}
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <div className="what">
                  <Mixed text={item.what} locale={locale} />
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
