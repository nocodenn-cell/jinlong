import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import { PLANS } from '@/lib/siteConfig'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const MONTH: Record<SiteLocale, string> = { 'pt-BR': '/mês', 'zh-CN': '/月' }
const PROVISIONAL: Record<SiteLocale, string> = { 'pt-BR': 'Preço provisório', 'zh-CN': '暂定价格' }

export function Price({ content, locale }: { content: HomeContent; locale: SiteLocale }) {
  const { price } = content
  return (
    <section className="jl-section jl-section--alt jl-section--tight" id="jiage" aria-labelledby="h-price">
      <div className="jl-wrap">
        <h2 className="jl-h2" id="h-price">{price.title}</h2>
        <div className="jl-plans" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {PLANS.items.map((plan) => (
            <div className="jl-price" key={plan.id} data-testid={`plan-${plan.id}`}>
              <h3>{plan.name[locale]}</h3>
              <p className="jl-price-value">
                {BRL.format(plan.price)}
                <small>{MONTH[locale]}</small>
              </p>
              {PLANS.provisional && <p className="jl-hint">{PROVISIONAL[locale]}</p>}
              <ul>
                {price.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <a className="jl-btn jl-btn--primary" href="#shiyong">{price.cta}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
