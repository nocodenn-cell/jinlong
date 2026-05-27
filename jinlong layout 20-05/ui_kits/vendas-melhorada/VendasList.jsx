// VendasList.jsx — lista paginada com scroll infinito (IntersectionObserver),
// linhas clicáveis com role=button + aria-label, suporte a teclado (Enter/Space).
// Estrutura espelha o VendasGerenteListClient.tsx do repo (mesmo conjunto de
// colunas), mas: (1) sem coluna "ações" inline; (2) row inteira é clicável e
// abre o detalhe em um modal acessível.

const PAGE_SIZE = 20;

function VendasList({ vendas, onRowClick }) {
  const [filtro, setFiltro] = React.useState('');
  const [visiveis, setVisiveis] = React.useState(PAGE_SIZE);
  const [loading, setLoading] = React.useState(false);
  const sentinelRef = React.useRef(null);

  const filtradas = React.useMemo(() => {
    if (!filtro.trim()) return vendas;
    const q = filtro.trim().toLowerCase();
    return vendas.filter((v) =>
      v.id.toLowerCase().includes(q) ||
      (v.forma_pagamento || '').toLowerCase().includes(q) ||
      (window.FORMA_LABEL[v.forma_pagamento] || '').toLowerCase().includes(q) ||
      (v.operador_nome || '').toLowerCase().includes(q) ||
      String(v.total_liquido).includes(q)
    );
  }, [vendas, filtro]);

  const hasMore = visiveis < filtradas.length;
  const mostradas = filtradas.slice(0, visiveis);

  // IntersectionObserver — mesma lógica do VendasGerenteListClient
  React.useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          setLoading(true);
          // simula latência da action remota
          setTimeout(() => {
            setVisiveis((n) => n + PAGE_SIZE);
            setLoading(false);
          }, 280);
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, filtro]);

  // reset paginação ao filtrar
  React.useEffect(() => { setVisiveis(PAGE_SIZE); }, [filtro]);

  function statusClass(s) {
    if (s === 'CANCELADA') return 'vendas-status-cancelada';
    if (s === 'CONCLUIDA') return 'vendas-status-concluida';
    return 'vendas-status-pendente';
  }

  function handleKey(e, v) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick(v);
    }
  }

  return (
    <>
      <div className="vendas-card">
        <div className="vendas-filterbar">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Buscar por #ID, valor, forma de pagamento ou operador…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              aria-label="Buscar vendas"
            />
          </div>
          <span style={{fontSize:12, color:'var(--fg-3)'}}>
            <b style={{color:'var(--fg-1)', fontFamily:'var(--font-numeric)'}}>{filtradas.length}</b> {filtradas.length === 1 ? 'venda' : 'vendas'}
          </span>
        </div>

        <div className="vendas-table-wrap">
          <table className="vendas-table">
            <thead>
              <tr>
                <th>Data</th>
                <th style={{textAlign:'right'}}>Total</th>
                <th>Forma</th>
                <th>Status</th>
                <th>Caixa</th>
                <th>Operador</th>
                <th aria-hidden></th>
              </tr>
            </thead>
            <tbody>
              {mostradas.map((v) => (
                <tr
                  key={v.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Abrir detalhes da venda ${window.fmtIdCurto(v.id)} — ${window.fmtBRL(v.total_liquido)} · ${window.STATUS_LABEL[v.status]}`}
                  onClick={() => onRowClick(v)}
                  onKeyDown={(e) => handleKey(e, v)}
                >
                  <td className="num" style={{whiteSpace:'nowrap'}}>{window.fmtDateTime(v.data)}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:600}}>{window.fmtBRL(v.total_liquido)}</td>
                  <td><span style={{color:'var(--fg-2)'}}>{window.FORMA_LABEL[v.forma_pagamento] || v.forma_pagamento}</span></td>
                  <td><span className={statusClass(v.status)}>{window.STATUS_LABEL[v.status] || v.status}</span></td>
                  <td><span className="row-id">{window.fmtIdCurto(v.caixa_id)}…</span></td>
                  <td><span style={{fontSize:12, color:'var(--fg-2)'}}>{v.operador_nome}</span></td>
                  <td style={{textAlign:'right', color:'var(--fg-3)', width:32}}>
                    <span className="row-arrow" aria-hidden>›</span>
                  </td>
                </tr>
              ))}
              {mostradas.length === 0 && (
                <tr style={{cursor:'default'}} onClick={(e)=>e.stopPropagation()}>
                  <td colSpan={7} className="empty">Nenhuma venda encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* sentinel para o IntersectionObserver */}
        {hasMore && (
          <div ref={sentinelRef} className="vendas-loader" aria-hidden={!loading}>
            <span className="vendas-loader-orbit" />
            <span>Carregando mais vendas…</span>
          </div>
        )}
        {!hasMore && mostradas.length > 0 && (
          <div className="vendas-end">— fim do histórico —</div>
        )}
      </div>
    </>
  );
}

window.VendasList = VendasList;
