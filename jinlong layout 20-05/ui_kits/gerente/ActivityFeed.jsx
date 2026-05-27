// ActivityFeed.jsx — recent venda / estoque / caixa activity timeline.
const ICON_MAP = { VENDA: 'receipt', ESTOQUE: 'boxes', CAIXA: 'wallet' };

function ActivityFeed({ items }) {
  return (
    <section className="panel" aria-labelledby="ger-act-h">
      <div className="panel-header">
        <span className="kpi-icon" aria-hidden dangerouslySetInnerHTML={{__html: window.KPIIcon.activity}} />
        <h2 id="ger-act-h" className="panel-title">Atividades recentes</h2>
      </div>
      <p className="panel-sub">Últimos eventos no caixa, no estoque e no financeiro.</p>
      <div>
        {items.map((a, idx) => (
          <div className="activity-row" key={idx}>
            <span
              className={`activity-icon ${a.tipo.toLowerCase()}`}
              aria-hidden
              dangerouslySetInnerHTML={{__html: window.KPIIcon[ICON_MAP[a.tipo]]}}
            />
            <div className="activity-line">{a.linha}</div>
            <div className="activity-when">{a.quando}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

window.ActivityFeed = ActivityFeed;
