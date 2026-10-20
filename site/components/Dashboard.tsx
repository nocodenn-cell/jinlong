import type { HomeContent } from '@/lib/content'
import { IconCart, IconPackage, IconTrend } from './Icons'

export function Dashboard({ content }: { content: HomeContent }) {
  const { panel } = content
  const [sales, ticket, low] = panel.stats
  return (
    <section className="vd-section" id="painel" aria-labelledby="h-panel">
      <div className="vd-container">
        <div className="vd-head vd-head--sm">
          <h2 id="h-panel">{panel.title}</h2>
          <p>{panel.subtitle}</p>
        </div>
        <div className="vd-board">
          <div className="vd-stats">
            <div className="vd-card">
              <div className="vd-stat-top">
                <span>{sales.label}</span>
                <IconTrend size={16} className="vd-brand" />
              </div>
              <p className="vd-stat-value">{sales.value}</p>
              <p className="vd-stat-note vd-brand-text">{sales.note}</p>
            </div>
            <div className="vd-card">
              <div className="vd-stat-top">
                <span>{ticket.label}</span>
                <IconCart size={16} className="vd-brand" />
              </div>
              <p className="vd-stat-value">{ticket.value}</p>
              <p className="vd-stat-note">{ticket.note}</p>
            </div>
            <div className="vd-card">
              <div className="vd-stat-top">
                <span>{low.label}</span>
                <IconPackage size={16} className="vd-amber" />
              </div>
              <p className="vd-stat-value">{low.value}</p>
              <p className="vd-stat-note vd-amber-text">{low.note}</p>
            </div>
          </div>
          <div className="vd-card">
            <h3 className="vd-top-title">
              {panel.topTitle} <span className="vd-sample">· {panel.sample}</span>
            </h3>
            <div className="vd-stack">
              {panel.top.map((row) => (
                <div key={row.name} className="vd-top-row">
                  <div className="vd-row-left">
                    <span className="vd-ic-sm">
                      <IconPackage size={20} />
                    </span>
                    <div>
                      <p className="vd-row-name">{row.name}</p>
                      <p className="vd-row-sub">{row.sales}</p>
                    </div>
                  </div>
                  <p className="vd-row-price">{row.total}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
