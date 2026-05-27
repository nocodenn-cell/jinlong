// ClientesList.jsx — tabela com scroll infinito, busca, e ações inline (editar/excluir).

const PAGE_SIZE = 20;

function ClientesList({ clientes, onEditar, onExcluir }) {
  const [filtro, setFiltro] = React.useState('');
  const [tipoFiltro, setTipoFiltro] = React.useState('todos'); // todos | PF | PJ | crediario
  const [visiveis, setVisiveis] = React.useState(PAGE_SIZE);
  const [loading, setLoading] = React.useState(false);
  const sentinelRef = React.useRef(null);

  const filtrados = React.useMemo(() => {
    let r = clientes;
    if (tipoFiltro === 'PF' || tipoFiltro === 'PJ') r = r.filter((c) => c.tipo === tipoFiltro);
    if (tipoFiltro === 'crediario') r = r.filter((c) => c.saldo_crediario > 0);
    if (filtro.trim()) {
      const q = filtro.trim().toLowerCase();
      r = r.filter((c) =>
        c.nome.toLowerCase().includes(q) ||
        c.documento.includes(q.replace(/\D/g, '')) ||
        (c.email || '').toLowerCase().includes(q) ||
        c.telefone.includes(q.replace(/\D/g, ''))
      );
    }
    return r;
  }, [clientes, tipoFiltro, filtro]);

  const hasMore = visiveis < filtrados.length;
  const mostrados = filtrados.slice(0, visiveis);

  React.useEffect(() => { setVisiveis(PAGE_SIZE); }, [filtro, tipoFiltro]);

  React.useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          setLoading(true);
          setTimeout(() => {
            setVisiveis((n) => n + PAGE_SIZE);
            setLoading(false);
          }, 240);
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, filtro, tipoFiltro]);

  const totalCrediario = clientes.filter(c => c.saldo_crediario > 0).length;

  return (
    <div className="vendas-card">
      <div className="vendas-filterbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            aria-label="Buscar clientes"
          />
        </div>
        <button className={'app-chip' + (tipoFiltro === 'todos' ? ' app-chip-active' : '')} onClick={() => setTipoFiltro('todos')}>
          Todos <span style={{opacity:.65, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{clientes.length}</span>
        </button>
        <button className={'app-chip' + (tipoFiltro === 'PF' ? ' app-chip-active' : '')} onClick={() => setTipoFiltro('PF')}>
          PF <span style={{opacity:.65, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{clientes.filter(c=>c.tipo==='PF').length}</span>
        </button>
        <button className={'app-chip' + (tipoFiltro === 'PJ' ? ' app-chip-active' : '')} onClick={() => setTipoFiltro('PJ')}>
          PJ <span style={{opacity:.65, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{clientes.filter(c=>c.tipo==='PJ').length}</span>
        </button>
        <button className={'app-chip' + (tipoFiltro === 'crediario' ? ' app-chip-active' : '')} onClick={() => setTipoFiltro('crediario')}>
          Com crediário <span style={{opacity:.65, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{totalCrediario}</span>
        </button>
      </div>

      <div className="vendas-table-wrap">
        <table className="vendas-table clientes-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Documento</th>
              <th>Telefone</th>
              <th style={{minWidth: 200}}>Saldo crediário</th>
              <th style={{textAlign:'right'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {mostrados.map((c) => {
              const usado = c.saldo_crediario;
              const limite = c.limite_crediario;
              const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
              const alerta = pct >= 70;
              const cls = usado === 0 ? 'muted' : alerta ? 'alert' : 'warn';
              return (
                <tr key={c.id}>
                  <td data-label="Cliente">
                    <div className="cli-nome">
                      <span className="cli-avatar">{window.initials(c.nome)}</span>
                      <div className="cli-info">
                        <b>
                          {c.nome}
                          <span className={'cli-tipo ' + (c.tipo === 'PF' ? 'pf' : 'pj')}>{c.tipo}</span>
                        </b>
                        <small>{c.email}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Documento">
                    <span className="cli-doc">{window.maskDoc(c.documento)}</span>
                  </td>
                  <td data-label="Telefone">
                    <span className="cli-tel">{window.maskTel(c.telefone)}</span>
                  </td>
                  <td data-label="Saldo crediário">
                    <div className="cli-saldo">
                      <div className="row">
                        <span className={'val ' + cls}>{window.fmtBRL(usado)}</span>
                        <span className="lim">/ {window.fmtBRL(limite)}</span>
                      </div>
                      <div className="bar" role="progressbar"
                        aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
                        aria-label={`${Math.round(pct)}% do limite usado`}>
                        <div className={'bar-fill' + (alerta ? ' alert' : '')} style={{width: pct + '%'}}></div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Ações" style={{textAlign:'right'}}>
                    <div className="cli-acoes">
                      <button
                        className="cli-acao-btn"
                        onClick={() => onEditar(c)}
                        aria-label={`Editar cliente ${c.nome}`}
                        title="Editar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="cli-acao-btn danger"
                        onClick={() => onExcluir(c)}
                        aria-label={`Excluir cliente ${c.nome}`}
                        title="Excluir"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/>
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {mostrados.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="cli-empty">
                    <span className="glyph">客</span>
                    <div className="title">Nenhum cliente encontrado</div>
                    <div className="sub">Tente outro termo de busca, ou cadastre um novo cliente.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="vendas-loader" aria-hidden={!loading}>
          <span className="vendas-loader-orbit" />
          <span>Carregando mais clientes…</span>
        </div>
      )}
      {!hasMore && mostrados.length > 0 && (
        <div className="vendas-end">— {filtrados.length} {filtrados.length === 1 ? 'cliente' : 'clientes'} —</div>
      )}
    </div>
  );
}

window.ClientesList = ClientesList;
