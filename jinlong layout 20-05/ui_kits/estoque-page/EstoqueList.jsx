// EstoqueList.jsx — lista com scroll infinito, filtros, toggle "só abaixo do mínimo".

const PAGE_SIZE = 15;

function EstoqueList({ produtos, onAjustar }) {
  const [busca, setBusca] = React.useState('');
  const [categoria, setCategoria] = React.useState('');
  const [soBaixo, setSoBaixo] = React.useState(false);
  const [visiveis, setVisiveis] = React.useState(PAGE_SIZE);
  const [loading, setLoading] = React.useState(false);
  const sentinelRef = React.useRef(null);

  const filtrados = React.useMemo(() => {
    let r = produtos;
    if (categoria) r = r.filter((p) => p.categoria_id === categoria);
    if (soBaixo)   r = r.filter((p) => p.quantidade_atual <= p.estoque_minimo);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      r = r.filter((p) =>
        p.nome.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.codigo_barras.includes(q) ||
        p.han.includes(busca.trim())
      );
    }
    return r;
  }, [produtos, busca, categoria, soBaixo]);

  const hasMore = visiveis < filtrados.length;
  const mostrados = filtrados.slice(0, visiveis);

  React.useEffect(() => { setVisiveis(PAGE_SIZE); }, [busca, categoria, soBaixo]);

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
          }, 220);
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading]);

  function getMotivoLabel(codigo) {
    return window.MOTIVOS.find((m) => m.value === codigo)?.label ?? codigo;
  }
  function getMotivoTipo(codigo) {
    return window.MOTIVOS.find((m) => m.value === codigo)?.tipo ?? 'adj';
  }

  return (
    <div className="vendas-card">
      <div className="vendas-filterbar" style={{flexWrap:'wrap'}}>
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Buscar por SKU, nome, código de barras ou 中文…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar produtos"
          />
        </div>

        <select
          className="estoque-cat-select"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {window.CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <button
          className={'estoque-toggle' + (soBaixo ? ' active' : '')}
          onClick={() => setSoBaixo(!soBaixo)}
          aria-pressed={soBaixo}
          type="button"
        >
          <span className="sw" aria-hidden="true"></span>
          Só abaixo do mínimo
        </button>

        <span style={{fontSize:12, color:'var(--fg-3)', marginLeft:'auto'}}>
          <b style={{color:'var(--fg-1)', fontFamily:'var(--font-numeric)'}}>{filtrados.length}</b> de {produtos.length}
        </span>
      </div>

      <div className="vendas-table-wrap">
        <table className="vendas-table estoque-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Produto</th>
              <th style={{textAlign:'right'}}>Estoque atual</th>
              <th style={{textAlign:'right'}}>Mínimo</th>
              <th>Status</th>
              <th>Última movimentação</th>
              <th style={{textAlign:'right'}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {mostrados.map((p) => {
              const critico = p.quantidade_atual <= p.estoque_minimo;
              const deficit = critico ? p.estoque_minimo - p.quantidade_atual : 0;
              const mTipo = getMotivoTipo(p.ultimo_motivo);
              return (
                <tr key={p.id} className={critico ? 'critico' : ''}>
                  <td data-label="Código">
                    <div className="sku">{p.sku}</div>
                    <div className="ean">{p.codigo_barras}</div>
                  </td>
                  <td data-label="Produto">
                    <div style={{fontWeight:600, color:'var(--fg-1)', fontSize:13}}>{p.nome}</div>
                    <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>
                      <span style={{letterSpacing:'0.02em'}}>{p.han}</span>
                      <span style={{margin:'0 8px'}}>·</span>
                      <span>{p.categoria_nome}</span>
                    </div>
                  </td>
                  <td data-label="Estoque atual" style={{textAlign:'right'}}>
                    <div className={'estoque-qty' + (critico ? ' critico' : '')}>
                      {window.fmtNum(p.quantidade_atual)}
                      <span className="un">{p.unidade_medida}</span>
                    </div>
                  </td>
                  <td data-label="Mínimo" style={{textAlign:'right'}}>
                    <div className="estoque-min"><b>{window.fmtNum(p.estoque_minimo)}</b> {p.unidade_medida}</div>
                    {deficit > 0 && (
                      <div className="estoque-deficit">−{window.fmtNum(deficit)} para repor</div>
                    )}
                  </td>
                  <td data-label="Status">
                    {critico
                      ? <span className="proto-pill err">Baixo</span>
                      : <span className="proto-pill ok">Normal</span>}
                  </td>
                  <td data-label="Última movimentação">
                    <div className={'estoque-mov ' + mTipo}>
                      <span className="when">{window.fmtRelative(p.ultima_movimentacao)}</span>
                      <span className="what">
                        {mTipo === 'in' ? '↑ ' : mTipo === 'out' ? '↓ ' : '⇄ '}
                        {getMotivoLabel(p.ultimo_motivo)}
                      </span>
                    </div>
                  </td>
                  <td data-label="Ações" style={{textAlign:'right'}}>
                    <button
                      className="app-btn app-btn-accent app-btn-sm"
                      onClick={() => onAjustar(p)}
                      aria-label={`Ajustar estoque de ${p.nome}`}
                    >
                      Ajustar
                    </button>
                  </td>
                </tr>
              );
            })}
            {mostrados.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="cli-empty estoque-empty">
                    <span className="glyph">库</span>
                    <div className="title">Nenhum produto encontrado</div>
                    <div className="sub">
                      {soBaixo
                        ? 'Não há produtos abaixo do estoque mínimo agora. 👍'
                        : 'Tente outro termo de busca, categoria ou desligue o filtro de mínimo.'}
                    </div>
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
          <span>Carregando mais produtos…</span>
        </div>
      )}
      {!hasMore && mostrados.length > 0 && (
        <div className="vendas-end">— {filtrados.length} {filtrados.length === 1 ? 'produto' : 'produtos'} —</div>
      )}
    </div>
  );
}

window.EstoqueList = EstoqueList;
