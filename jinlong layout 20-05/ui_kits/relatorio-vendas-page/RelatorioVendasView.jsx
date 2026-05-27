// RelatorioVendasView.jsx — view interativa com filtros + chart + tabela + CSV

function RelatorioVendasView() {
  const hoje = new Date(window.HOJE);
  const _seteDias = new Date(window.HOJE - 6 * 86400000);
  const [dataInicial, setDataInicial] = React.useState(_seteDias.toISOString().slice(0,10));
  const [dataFinal, setDataFinal] = React.useState(hoje.toISOString().slice(0,10));
  const [vendedor, setVendedor] = React.useState('');
  const [categoria, setCategoria] = React.useState('');
  const [forma, setForma] = React.useState('');

  const filtradas = React.useMemo(() => {
    const di = new Date(dataInicial).getTime();
    const df = new Date(dataFinal).getTime() + 86400000;
    return window.VENDAS.filter((v) => {
      const t = new Date(v.data).getTime();
      if (t < di || t > df) return false;
      if (vendedor && v.vendedor !== vendedor) return false;
      if (categoria && v.categoria_principal !== categoria) return false;
      if (forma && v.forma_pagamento !== forma) return false;
      return true;
    });
  }, [dataInicial, dataFinal, vendedor, categoria, forma]);

  // Agrupa por dia para o gráfico
  const porDia = React.useMemo(() => {
    const mapa = new Map();
    filtradas.forEach((v) => {
      const d = new Date(v.data).toISOString().slice(0, 10);
      if (!mapa.has(d)) mapa.set(d, { dia: d, total: 0, vendas: 0 });
      const acc = mapa.get(d);
      acc.total += v.status === 'CONCLUIDA' ? v.total_liquido : 0;
      acc.vendas += v.status === 'CONCLUIDA' ? 1 : 0;
    });
    return [...mapa.values()].sort((a,b) => a.dia.localeCompare(b.dia));
  }, [filtradas]);

  const totalLiquido = filtradas.reduce((s, v) => s + (v.status === 'CONCLUIDA' ? v.total_liquido : 0), 0);
  const numConcluidas = filtradas.filter((v) => v.status === 'CONCLUIDA').length;
  const numCanceladas = filtradas.filter((v) => v.status === 'CANCELADA').length;
  const ticket = numConcluidas ? totalLiquido / numConcluidas : 0;
  const picoDia = porDia.reduce((max, d) => d.total > max ? d.total : max, 0);

  function limparFiltros() {
    setDataInicial(_seteDias.toISOString().slice(0,10));
    setDataFinal(hoje.toISOString().slice(0,10));
    setVendedor(''); setCategoria(''); setForma('');
  }

  return (
    <>
      <div className="vendas-card" style={{padding:20, marginBottom:18}}>
        <div className="rv-filters">
          <label>Data inicial
            <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} />
          </label>
          <label>Data final
            <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} />
          </label>
          <label>Vendedor
            <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
              <option value="">Todos</option>
              {window.VENDEDORES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label>Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {window.CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Forma de pagamento
            <select value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="">Todas</option>
              {window.FORMAS.map((f) => <option key={f} value={f}>{window.FORMA_LBL[f]}</option>)}
            </select>
          </label>
        </div>
        <div style={{display:'flex', gap:10, marginTop:8}}>
          <button className="app-btn app-btn-neutral" onClick={limparFiltros}>Limpar filtros</button>
          <div style={{flex:1}} />
          <button className="app-btn app-btn-neutral" onClick={() => window.gerarCsv(filtradas)}>↓ Exportar CSV</button>
          <button className="app-btn app-btn-neutral" onClick={() => window.print()}>↓ Exportar PDF (Imprimir)</button>
        </div>
      </div>

      <div className="rv-totais">
        <div className="rv-tot accent">
          <div className="lbl">Faturamento</div>
          <div className="val">{window.fmtBRL(totalLiquido)}</div>
          <div className="sub">{numConcluidas} vendas concluídas</div>
        </div>
        <div className="rv-tot">
          <div className="lbl">Ticket médio</div>
          <div className="val">{window.fmtBRL(ticket)}</div>
        </div>
        <div className="rv-tot success">
          <div className="lbl">Concluídas</div>
          <div className="val">{numConcluidas}</div>
        </div>
        <div className="rv-tot">
          <div className="lbl">Canceladas</div>
          <div className="val" style={{color: numCanceladas > 0 ? '#fca5a5' : 'var(--fg-1)'}}>{numCanceladas}</div>
        </div>
      </div>

      <div className="rv-chart">
        <div className="rv-chart-head">
          <div>
            <h3 className="ttl">Faturamento por dia</h3>
            <p className="sub">{porDia.length} {porDia.length === 1 ? 'dia' : 'dias'} no período · clique nas barras para ver detalhes.</p>
          </div>
          <div className="pico">
            <div className="lbl">Pico</div>
            <div className="val">{window.fmtBRL(picoDia)}</div>
          </div>
        </div>
        {porDia.length === 0 ? (
          <p style={{textAlign:'center', color:'var(--fg-3)', padding:'40px 0'}}>Sem dados no período selecionado.</p>
        ) : (
          <>
            <div className="rv-bars" role="img" aria-label="Gráfico de barras: faturamento por dia">
              {porDia.map((d) => (
                <div key={d.dia} className="rv-bar" style={{height: picoDia ? `${(d.total / picoDia) * 100}%` : '4%'}}
                  tabIndex={0} aria-label={`${window.fmtDate(d.dia + 'T00:00:00')}: ${window.fmtBRL(d.total)}`}>
                  <div className="tip">
                    {window.fmtDate(d.dia + 'T00:00:00')}<span className="v">{window.fmtBRL(d.total)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="rv-axis">
              <span>{window.fmtDate(porDia[0].dia + 'T00:00:00')}</span>
              <span>{window.fmtDate(porDia[porDia.length - 1].dia + 'T00:00:00')}</span>
            </div>
          </>
        )}
      </div>

      <div className="vendas-card">
        <div className="vendas-filterbar" style={{borderBottom:'none', justifyContent:'space-between'}}>
          <h3 style={{margin:0, fontSize:14, fontWeight:600, color:'var(--fg-1)'}}>Vendas no período</h3>
          <span style={{fontSize:12, color:'var(--fg-3)'}}>{filtradas.length} {filtradas.length === 1 ? 'venda' : 'vendas'}</span>
        </div>
        <div className="vendas-table-wrap">
          <table className="vendas-table">
            <thead>
              <tr>
                <th>Data</th><th>ID</th><th>Cliente</th><th>Vendedor</th>
                <th style={{textAlign:'right'}}>Total</th><th>Forma</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 100).map((v) => (
                <tr key={v.id} style={{cursor:'default'}}>
                  <td className="num">{window.fmtDateTime(v.data)}</td>
                  <td className="num" style={{color:'var(--fg-3)'}}>#{v.id.slice(0,8)}</td>
                  <td>{v.cliente || <span style={{color:'var(--fg-3)'}}>—</span>}</td>
                  <td style={{color:'var(--fg-2)', fontSize:12}}>{v.vendedor}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:600,
                    textDecoration: v.status === 'CANCELADA' ? 'line-through' : 'none',
                    color: v.status === 'CANCELADA' ? 'var(--fg-3)' : 'var(--fg-1)'}}>
                    {window.fmtBRL(v.total_liquido)}
                  </td>
                  <td style={{fontSize:12, color:'var(--fg-2)'}}>{window.FORMA_LBL[v.forma_pagamento]}</td>
                  <td>
                    {v.status === 'CONCLUIDA'
                      ? <span className="proto-pill ok">Concluída</span>
                      : <span className="proto-pill err">Cancelada</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtradas.length > 100 && (
          <div className="vendas-end">Mostrando 100 de {filtradas.length} · use os filtros para refinar ou exporte para CSV.</div>
        )}
        {filtradas.length === 0 && (
          <div className="cli-empty">
            <span className="glyph">销</span>
            <div className="title">Nenhuma venda no período</div>
            <div className="sub">Ajuste os filtros ou estenda o intervalo de datas.</div>
          </div>
        )}
      </div>
    </>
  );
}
window.RelatorioVendasView = RelatorioVendasView;
