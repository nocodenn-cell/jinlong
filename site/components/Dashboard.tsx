import type { HomeContent } from '@/lib/content'

/** Demo do painel: indicadores do dia e mais vendidos (dados fictícios, sinalizados). */
export function Dashboard({ content }: { content: HomeContent }) {
  const { panel } = content
  return (
    <section className="jl-section jl-section--tight" id="kanban" aria-labelledby="h-panel">
      <div className="jl-wrap">
        <h2 className="jl-h2" id="h-panel">{panel.title}</h2>
        <p className="jl-lead">{panel.lead}</p>
        <div className="jl-board">
          <div className="jl-board-stats">
            {panel.stats.map((stat) => (
              <div key={stat.label} className="jl-board-card">
                <span className="k">{stat.label}</span>
                <b className="n">{stat.value}</b>
                <small>{stat.note}</small>
              </div>
            ))}
          </div>
          <div className="jl-board-card">
            <h3>
              {panel.topTitle} <span className="jl-demo-tag">{panel.sample}</span>
            </h3>
            <ol className="jl-top">
              {panel.top.map((row) => (
                <li key={row.name}>
                  <span className="p">{row.name}</span>
                  <span className="q">{row.sales}</span>
                  <b className="n">{row.total}</b>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
