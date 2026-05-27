// StockCriticalPanel.jsx — list of items below minimum stock with deficit deltas.
function StockCriticalPanel({ items }) {
  return (
    <section className="panel" aria-labelledby="ger-stock-h">
      <div className="panel-header">
        <span className="kpi-icon" aria-hidden dangerouslySetInnerHTML={{__html: window.KPIIcon.packagex}} style={{color: '#fca5a5', background: 'color-mix(in srgb, #ef4444 14%, transparent)'}}/>
        <h2 id="ger-stock-h" className="panel-title">Estoque crítico</h2>
      </div>
      <p className="panel-sub">Itens abaixo do mínimo · ação recomendada para reposição esta semana.</p>
      <div>
        {items.map((it) => (
          <div className="stock-row" key={it.sku}>
            <div>
              <div className="stock-name">{it.name}</div>
              <div className="stock-sku">{it.sku}  ·  <span className="stock-han">{it.han}</span></div>
            </div>
            <div className="stock-qty">
              <div><span className="now">{it.atual}</span> <span className="min">/ {it.min}</span></div>
              <div className="deficit">déficit −{it.deficit}</div>
            </div>
          </div>
        ))}
      </div>
      <a href="#" className="panel-link">Ver todos →</a>
    </section>
  );
}

window.StockCriticalPanel = StockCriticalPanel;
