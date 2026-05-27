// ContasList.jsx — lista com KPIs, filtros (período + fornecedor + status), tabela e ações.

function ContasList({ contas, onRegistrarPagamento, onCancelar }) {
  const [busca, setBusca] = React.useState('');
  const [fornecedor, setForn] = React.useState('');
  const [status, setStatus] = React.useState('todos');
  // Período: YYYY-MM (mês de vencimento). '' = qualquer mês.
  const [periodo, setPeriodo] = React.useState('');

  // KPIs
  const kpis = React.useMemo(() => {
    let totalAbertos = 0, qtdAbertos = 0, totalAtrasados = 0, qtdAtrasados = 0, pagoMes = 0;
    const inicioMes = new Date(window.HOJE);
    inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
    contas.forEach((c) => {
      const aberto = c.valor_total - c.valor_pago;
      if (c.status === 'PENDENTE' || c.status === 'PARCIAL') {
        totalAbertos += aberto; qtdAbertos++;
      }
      if (c.status === 'ATRASADO') {
        totalAtrasados += aberto; qtdAtrasados++;
      }
      if (c.status === 'PAGO' && new Date(c.criado_em).getTime() >= inicioMes.getTime()) {
        pagoMes += c.valor_total;
      }
    });
    return { totalAbertos, qtdAbertos, totalAtrasados, qtdAtrasados, pagoMes };
  }, [contas]);

  const filtrados = React.useMemo(() => {
    let r = contas;
    if (status !== 'todos') r = r.filter((c) => c.status === status.toUpperCase());
    if (fornecedor) r = r.filter((c) => c.fornecedor_nome === fornecedor);
    if (periodo) {
      const [y, mo] = periodo.split('-').map(Number);
      r = r.filter((c) => {
        const d = new Date(c.vencimento);
        return d.getFullYear() === y && (d.getMonth() + 1) === mo;
      });
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      r = r.filter((c) =>
        c.descricao.toLowerCase().includes(q) ||
        c.fornecedor_nome.toLowerCase().includes(q) ||
        (c.nfe_numero || '').includes(q)
      );
    }
    return r;
  }, [contas, busca, fornecedor, status, periodo]);

  const fornecedoresUnicos = React.useMemo(
    () => [...new Set(contas.map((c) => c.fornecedor_nome))].sort(),
    [contas]
  );

  function statusBadge(s, diasVenc) {
    if (s === 'PAGO')      return <span className="proto-pill pago">Pago</span>;
    if (s === 'PARCIAL')   return <span className="proto-pill parcial">Parcial</span>;
    if (s === 'ATRASADO')  return <span className="proto-pill atrasado">Atrasado</span>;
    if (s === 'CANCELADO') return <span className="proto-pill cancelado">Cancelado</span>;
    return <span className="proto-pill pendente">Pendente</span>;
  }

  function vencimentoCell(c) {
    const ms = new Date(c.vencimento).getTime() - window.HOJE;
    const dias = Math.round(ms / 86400000);
    const cls = c.status === 'PAGO' || c.status === 'CANCELADO' ? '' :
                dias < 0 ? 'atrasado' :
                dias <= 7 ? 'proximo' : '';
    return (
      <div className={'cp-venc ' + cls}>
        {window.fmtDate(c.vencimento)}
        {(c.status !== 'PAGO' && c.status !== 'CANCELADO') && (
          <span className="relativo">{window.fmtRelativoVenc(c.vencimento)}</span>
        )}
      </div>
    );
  }

  return (
    <>
      {/* KPIs */}
      <div className="cp-kpis">
        <div className="cp-kpi accent">
          <div className="lbl">Em aberto</div>
          <div className="val">{window.fmtBRL(kpis.totalAbertos)}</div>
          <div className="sub">{kpis.qtdAbertos} {kpis.qtdAbertos === 1 ? 'conta' : 'contas'}</div>
        </div>
        <div className="cp-kpi danger">
          <div className="lbl">Atrasadas</div>
          <div className="val">{window.fmtBRL(kpis.totalAtrasados)}</div>
          <div className="sub">{kpis.qtdAtrasados} {kpis.qtdAtrasados === 1 ? 'conta vencida' : 'contas vencidas'}</div>
        </div>
        <div className="cp-kpi">
          <div className="lbl">Pago este mês</div>
          <div className="val" style={{color:'#6ee7b7'}}>{window.fmtBRL(kpis.pagoMes)}</div>
          <div className="sub">consolidado mai/2026</div>
        </div>
        <div className="cp-kpi">
          <div className="lbl">Total filtrado</div>
          <div className="val">{filtrados.length}</div>
          <div className="sub">de {contas.length} contas</div>
        </div>
      </div>

      <div className="vendas-card">
        <div className="vendas-filterbar" style={{borderBottom:'none'}}>
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" placeholder="Buscar por descrição, fornecedor ou nº NF-e…"
              value={busca} onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar contas" />
          </div>
        </div>

        <div className="cp-filters-row">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            aria-label="Filtrar por mês de vencimento" />

          <select value={fornecedor} onChange={(e) => setForn(e.target.value)} aria-label="Filtrar por fornecedor">
            <option value="">Todos os fornecedores</option>
            {fornecedoresUnicos.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>

          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {['todos','pendente','parcial','atrasado','pago','cancelado'].map((s) => (
              <button key={s} className={'app-chip' + (status === s ? ' app-chip-active' : '')}
                onClick={() => setStatus(s)}>
                {s === 'todos' ? 'Todos' : s === 'pendente' ? 'Pendentes' : s === 'parcial' ? 'Parciais' :
                 s === 'atrasado' ? 'Atrasadas' : s === 'pago' ? 'Pagas' : 'Canceladas'}
              </button>
            ))}
          </div>

          {(periodo || fornecedor || status !== 'todos' || busca) && (
            <button className="app-chip" style={{marginLeft:'auto', color:'var(--fg-3)'}}
              onClick={() => { setPeriodo(''); setForn(''); setStatus('todos'); setBusca(''); }}>
              Limpar filtros
            </button>
          )}
        </div>

        <div className="vendas-table-wrap">
          <table className="vendas-table cp-table">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Descrição</th>
                <th>Vencimento</th>
                <th style={{textAlign:'right'}}>Valor</th>
                <th>Status</th>
                <th style={{textAlign:'right'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => {
                const aberto = c.valor_total - c.valor_pago;
                const pct = c.valor_total > 0 ? (c.valor_pago / c.valor_total) * 100 : 0;
                const podePagar = c.status !== 'PAGO' && c.status !== 'CANCELADO';
                return (
                  <tr key={c.id}>
                    <td data-label="Fornecedor">
                      <b style={{color:'var(--fg-1)', fontSize:13}}>{c.fornecedor_nome}</b>
                    </td>
                    <td data-label="Descrição" className="desc-cell">
                      <b>{c.descricao}</b>
                      <small>Lançado em {window.fmtDate(c.criado_em)}</small>
                      {c.nfe_numero && (
                        <a className="nfe-link" href="#" onClick={(e)=>e.preventDefault()}>
                          ↗ NF-e #{c.nfe_numero}
                        </a>
                      )}
                    </td>
                    <td data-label="Vencimento">{vencimentoCell(c)}</td>
                    <td data-label="Valor" className="cp-valor-cell">
                      <span className="val">{window.fmtBRL(c.valor_total)}</span>
                      {c.valor_pago > 0 && c.status !== 'CANCELADO' && (
                        <>
                          <span className="pago">
                            pago {window.fmtBRL(c.valor_pago)}
                            {aberto > 0.001 && <> · aberto <b style={{color:'var(--accent)'}}>{window.fmtBRL(aberto)}</b></>}
                          </span>
                          <div className="bar">
                            <div className={'bar-fill' + (c.status === 'PARCIAL' ? ' partial' : '')}
                              style={{width: pct + '%'}}></div>
                          </div>
                        </>
                      )}
                    </td>
                    <td data-label="Status">{statusBadge(c.status)}</td>
                    <td data-label="Ações" style={{textAlign:'right'}}>
                      <div className="cp-acoes">
                        {podePagar && (
                          <button className="btn-pagar" onClick={() => onRegistrarPagamento(c)}
                            aria-label={`Registrar pagamento de ${c.descricao}`}>
                            $ Pagar
                          </button>
                        )}
                        {podePagar && (
                          <button className="cli-acao-btn danger" onClick={() => onCancelar(c)}
                            aria-label={`Cancelar conta ${c.descricao}`} title="Cancelar conta">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="cli-empty">
                      <span className="glyph">应</span>
                      <div className="title">Nenhuma conta encontrada</div>
                      <div className="sub">Ajuste os filtros, ou lance uma nova conta a pagar.</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtrados.length > 0 && (
          <div className="vendas-end">— {filtrados.length} {filtrados.length === 1 ? 'conta' : 'contas'} —</div>
        )}
      </div>
    </>
  );
}

window.ContasList = ContasList;
