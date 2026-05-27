// FornecedoresList.jsx — lista + busca + filtro status + seleção em lote.

const PAGE_SIZE = 15;

function FornecedoresList({ fornecedores, selecionados, onSelecionar, onEditar, onExcluir, onBulkAtivar, onBulkExcluir }) {
  const [busca, setBusca] = React.useState('');
  const [filtro, setFiltro] = React.useState('todos'); // todos | ativos | inativos
  const [visiveis, setVisiveis] = React.useState(PAGE_SIZE);
  const [loading, setLoading] = React.useState(false);
  const sentinelRef = React.useRef(null);

  const filtrados = React.useMemo(() => {
    let r = fornecedores;
    if (filtro === 'ativos')   r = r.filter((f) => f.ativo);
    if (filtro === 'inativos') r = r.filter((f) => !f.ativo);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      const qDig = q.replace(/\D/g, '');
      r = r.filter((f) =>
        f.nome.toLowerCase().includes(q) ||
        (qDig && f.documento.includes(qDig)) ||
        (qDig && f.telefone.includes(qDig)) ||
        (f.email || '').toLowerCase().includes(q) ||
        (f.contato_pessoa || '').toLowerCase().includes(q) ||
        (f.categoria || '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [fornecedores, busca, filtro]);

  const hasMore = visiveis < filtrados.length;
  const mostrados = filtrados.slice(0, visiveis);

  React.useEffect(() => { setVisiveis(PAGE_SIZE); }, [busca, filtro]);
  React.useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading) {
        setLoading(true);
        setTimeout(() => { setVisiveis((n) => n + PAGE_SIZE); setLoading(false); }, 240);
      }
    }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading]);

  const idsPagina = mostrados.map((f) => f.id);
  const todosPagSel = idsPagina.length > 0 && idsPagina.every((id) => selecionados.has(id));
  const algumPagSel = idsPagina.some((id) => selecionados.has(id));

  function toggleAll() {
    const next = new Set(selecionados);
    if (todosPagSel) idsPagina.forEach((id) => next.delete(id));
    else idsPagina.forEach((id) => next.add(id));
    onSelecionar(next);
  }
  function toggleOne(id) {
    const next = new Set(selecionados);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelecionar(next);
  }

  const headerCheckRef = React.useCallback((el) => {
    if (el) el.indeterminate = algumPagSel && !todosPagSel;
  }, [algumPagSel, todosPagSel]);

  return (
    <>
      {selecionados.size > 0 && (
        <div className="bulk-bar" role="region" aria-label={`${selecionados.size} selecionados`}>
          <span className="count"><b>{selecionados.size}</b> selecionado{selecionados.size !== 1 ? 's' : ''}</span>
          <span className="spacer"></span>
          <button onClick={() => onBulkAtivar(true)}>Ativar</button>
          <button onClick={() => onBulkAtivar(false)}>Inativar</button>
          <button className="danger" onClick={onBulkExcluir}>Excluir selecionados</button>
          <button onClick={() => onSelecionar(new Set())}>Limpar seleção</button>
        </div>
      )}

      <div className="vendas-card">
        <div className="vendas-filterbar">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" placeholder="Buscar por nome, CNPJ, contato, e-mail ou categoria…"
              value={busca} onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar fornecedores" />
          </div>
          <button className={'app-chip' + (filtro === 'todos' ? ' app-chip-active' : '')} onClick={() => setFiltro('todos')}>
            Todos <span style={{opacity:.65, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{fornecedores.length}</span>
          </button>
          <button className={'app-chip' + (filtro === 'ativos' ? ' app-chip-active' : '')} onClick={() => setFiltro('ativos')}>
            Ativos <span style={{opacity:.65, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{fornecedores.filter(f=>f.ativo).length}</span>
          </button>
          <button className={'app-chip' + (filtro === 'inativos' ? ' app-chip-active' : '')} onClick={() => setFiltro('inativos')}>
            Inativos <span style={{opacity:.65, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{fornecedores.filter(f=>!f.ativo).length}</span>
          </button>
        </div>

        <div className="vendas-table-wrap">
          <table className="vendas-table forn-table">
            <thead>
              <tr>
                <th className="sel-col">
                  <input ref={headerCheckRef} type="checkbox" className="forn-checkbox"
                    checked={todosPagSel} onChange={toggleAll}
                    disabled={mostrados.length === 0}
                    aria-label="Selecionar todos da página" />
                </th>
                <th>Nome</th>
                <th>CNPJ / CPF</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Status</th>
                <th style={{textAlign:'right'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {mostrados.map((f) => (
                <tr key={f.id} className={f.ativo ? '' : 'inativo'}>
                  <td data-label="" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="forn-checkbox"
                      checked={selecionados.has(f.id)}
                      onChange={() => toggleOne(f.id)}
                      aria-label={`Selecionar ${f.nome}`} />
                  </td>
                  <td data-label="Nome">
                    <div className="cli-nome forn-nome">
                      <span className="cli-avatar">{window.initials(f.nome)}</span>
                      <div className="cli-info">
                        <b>{f.nome}</b>
                        <small>{f.contato_pessoa} · {f.categoria}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="CNPJ / CPF"><span className="cli-doc">{window.maskCNPJ(f.documento)}</span></td>
                  <td data-label="Telefone"><span className="cli-tel">{window.maskTel(f.telefone)}</span></td>
                  <td data-label="E-mail">
                    <a href={`mailto:${f.email}`} style={{color:'var(--fg-2)', fontSize:12, textDecoration:'none'}}
                       onClick={(e)=>e.stopPropagation()}>{f.email}</a>
                  </td>
                  <td data-label="Status">
                    {f.ativo
                      ? <span className="proto-pill ok">Ativo</span>
                      : <span className="proto-pill muted">Inativo</span>}
                  </td>
                  <td data-label="Ações" style={{textAlign:'right'}}>
                    <div className="cli-acoes">
                      <button className="cli-acao-btn" onClick={() => onEditar(f)} aria-label={`Editar ${f.nome}`} title="Editar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="cli-acao-btn danger" onClick={() => onExcluir(f)} aria-label={`Excluir ${f.nome}`} title="Excluir">
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
              ))}
              {mostrados.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="cli-empty">
                      <span className="glyph">供</span>
                      <div className="title">Nenhum fornecedor encontrado</div>
                      <div className="sub">Tente outro termo de busca, ou cadastre um novo fornecedor.</div>
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
            <span>Carregando mais fornecedores…</span>
          </div>
        )}
        {!hasMore && mostrados.length > 0 && (
          <div className="vendas-end">— {filtrados.length} {filtrados.length === 1 ? 'fornecedor' : 'fornecedores'} —</div>
        )}
      </div>
    </>
  );
}

window.FornecedoresList = FornecedoresList;
