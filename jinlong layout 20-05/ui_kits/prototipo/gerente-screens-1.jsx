// gerente-screens-1.jsx — Início (dashboard), Histórico de vendas, Produtos, Estoque.

// ————————————————————————————————————————————————————
// Início (dashboard) — reaproveita KPIs do gerente original
// ————————————————————————————————————————————————————
function ScreenInicio({ go }) {
  const HORAS = [0,0,0,0,0,0,0,80,240,420,580,720,910,1140,1480,1620,1340,1180,920,640,420,240,120,60];
  const max = Math.max(...HORAS);

  return (
    <div className="proto-page" data-screen-label="inicio">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Bem-vindo · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>欢迎</span></p>
          <h1 className="proto-page-title">Olá, M. Wei</h1>
          <p className="proto-page-sub">Resumo de <b style={{color:'var(--fg-2)'}}>quinta-feira, 14 de maio</b> · loja Jīn Lóng — Paulista.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-chip app-chip-active">Hoje</button>
          <button className="app-chip">7 dias</button>
          <button className="app-chip">30 dias</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
        {[
          { label:'Faturamento hoje',  value: window.fmtBRL(12430.75), trend:+12.4 },
          { label:'Ticket médio hoje', value: window.fmtBRL(86.32),    trend:+3.1  },
          { label:'Vendas hoje',       value: window.fmtNum(144),      trend:+8.9  },
          { label:'Margem hoje',       value: window.fmtBRL(4880.40),  trend:-1.2  },
        ].map((k) => (
          <div key={k.label} className="proto-panel" style={{padding:18}}>
            <div style={{display:'flex', justifyContent:'space-between'}}>
              <span style={{fontSize:12, color:'var(--fg-3)'}}>{k.label}</span>
              <span style={{
                width:28, height:28, borderRadius:6,
                background:'color-mix(in srgb, var(--accent) 14%, transparent)', color:'var(--accent)',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:14,
              }}>◉</span>
            </div>
            <div className="num" style={{fontSize:28, fontWeight:700, marginTop:10, lineHeight:1.1}}>{k.value}</div>
            <div style={{fontSize:12, fontWeight:600, marginTop:6, fontFamily:'var(--font-numeric)',
              color: k.trend > 0 ? '#34d399' : '#fca5a5'}}>
              {k.trend > 0 ? '↑' : '↓'} {Math.abs(k.trend).toFixed(1).replace('.', ',')}%
            </div>
          </div>
        ))}
      </div>
      <p style={{fontSize:12, color:'var(--fg-3)', marginTop:8, marginBottom:0}}>vs. dia anterior</p>

      <section className="proto-panel" style={{marginTop:28}}>
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:14}}>
          <div>
            <h2 className="proto-panel-title">Faturamento por hora — hoje</h2>
            <p className="proto-panel-sub">Curva intra-dia, 24 horas.</p>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.14em'}}>Pico hoje</div>
            <div className="num" style={{fontSize:16, fontWeight:600, marginTop:2}}>{window.fmtBRL(max)}</div>
          </div>
        </div>
        <div className="proto-bars" style={{height:100}}>
          {HORAS.map((v, i) => (
            <div key={i} className="bar" style={{height: max ? `${(v/max)*100}%` : '2%', opacity: i === 15 ? 1 : 0.85}} />
          ))}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', fontFamily:'var(--font-numeric)', fontSize:10, color:'var(--fg-3)', marginTop:6}}>
          <span>00 h</span><span>06 h</span><span>12 h</span><span>18 h</span><span>24 h</span>
        </div>
      </section>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginTop:24}}>
        <div className="proto-panel">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
            <div>
              <h2 className="proto-panel-title">Estoque crítico</h2>
              <p className="proto-panel-sub">4 SKUs abaixo do mínimo · ação recomendada.</p>
            </div>
            <button className="app-chip" onClick={()=>go('estoque')}>Ver tudo →</button>
          </div>
          {[
            { sku:'JL-0017', name:'Pulseira de jade — fio duplo', han:'玉手镯', atual:3, min:12, deficit:9 },
            { sku:'JL-0203', name:'Lanterna de papel vermelha',   han:'红纸灯笼', atual:8, min:20, deficit:12 },
            { sku:'JL-0501', name:'Bule de porcelana — dragão',    han:'龙纹瓷壶', atual:4, min:10, deficit:6 },
            { sku:'JL-0091', name:'Sino de vento de bronze',       han:'黄铜风铃', atual:2, min:8,  deficit:6 },
          ].map((s) => (
            <div key={s.sku} style={{display:'grid', gridTemplateColumns:'1fr auto', padding:'12px 0', borderBottom:'1px solid rgba(148,163,184,0.18)', gap:12, alignItems:'center'}}>
              <div>
                <div style={{fontSize:13, fontWeight:600}}>{s.name}</div>
                <div style={{fontSize:11, color:'var(--fg-3)'}}>{s.sku} · <span style={{letterSpacing:'0.02em'}}>{s.han}</span></div>
              </div>
              <div style={{textAlign:'right'}} className="num">
                <div style={{fontSize:14, fontWeight:700}}>{s.atual} <span style={{color:'var(--fg-3)', fontWeight:400, fontSize:12}}>/ mín {s.min}</span></div>
                <div style={{fontSize:11, color:'#fca5a5', marginTop:2}}>−{s.deficit} un</div>
              </div>
            </div>
          ))}
        </div>

        <div className="proto-panel">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
            <div>
              <h2 className="proto-panel-title">Atividades recentes</h2>
              <p className="proto-panel-sub">Vendas, caixas e estoque das últimas 4 horas.</p>
            </div>
            <button className="app-chip" onClick={()=>go('historico')}>Histórico →</button>
          </div>
          {[
            { tipo:'VENDA',   linha:<>Venda #1208 finalizada · <b>R$ 142,30</b> · PIX</>,            quando:'há 6 min',  color:'var(--accent)' },
            { tipo:'CAIXA',   linha:<>Sangria de <b>R$ 200,00</b> aprovada por M. Wei · caixa 01</>, quando:'há 24 min', color:'#93c5fd' },
            { tipo:'ESTOQUE', linha:<>Importação NF-e #220 · <b>48 itens</b> adicionados</>,         quando:'há 1 h 12 min', color:'#34d399' },
            { tipo:'VENDA',   linha:<>Venda #1207 finalizada · <b>R$ 58,90</b> · Dinheiro</>,        quando:'há 1 h 38 min', color:'var(--accent)' },
            { tipo:'CAIXA',   linha:<>Caixa 02 aberto por J. Wei · saldo inicial R$ 150,00</>,       quando:'há 3 h',    color:'#93c5fd' },
          ].map((a, i) => (
            <div key={i} style={{display:'grid', gridTemplateColumns:'56px 1fr auto', gap:10, padding:'12px 0', borderBottom:'1px solid rgba(148,163,184,0.18)', alignItems:'center'}}>
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:'0.12em', textAlign:'center',
                padding:'4px 6px', borderRadius:4, color: a.color,
                border:`1px solid ${a.color}`,
                background:'rgba(15,23,42,0.45)',
              }}>{a.tipo}</span>
              <div style={{fontSize:13, color:'var(--fg-1)', lineHeight:1.4}}>{a.linha}</div>
              <div className="num" style={{fontSize:11, color:'var(--fg-3)'}}>{a.quando}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Histórico de vendas
// ————————————————————————————————————————————————————
function ScreenHistorico({ openDrawer }) {
  const [filtro, setFiltro] = React.useState('todas');
  const vendas = window.VENDAS;
  const total = vendas.reduce((s, v) => s + (v.status === 'concluida' ? v.total : 0), 0);

  const filtros = [
    { id:'todas',   label:'Todas',     n: vendas.length },
    { id:'pix',     label:'PIX',       n: vendas.filter(v=>v.metodo==='PIX').length },
    { id:'cartao',  label:'Cartão',    n: vendas.filter(v=>v.metodo==='Cartão').length },
    { id:'dinheiro',label:'Dinheiro',  n: vendas.filter(v=>v.metodo==='Dinheiro').length },
    { id:'crediario',label:'Crediário',n: vendas.filter(v=>v.metodo==='Crediário').length },
    { id:'devolvidas',label:'Devolvidas',n: vendas.filter(v=>v.status==='devolvida' || v.status==='cancelada').length },
  ];
  const filteredVendas = vendas.filter(v => {
    if (filtro === 'todas') return true;
    if (filtro === 'devolvidas') return v.status === 'devolvida' || v.status === 'cancelada';
    return v.metodo.toLowerCase() === filtro || (filtro === 'cartao' && v.metodo === 'Cartão');
  });

  return (
    <div className="proto-page" data-screen-label="historico">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Operações · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>销售历史</span></p>
          <h1 className="proto-page-title">Histórico de vendas</h1>
          <p className="proto-page-sub">{vendas.length} vendas hoje · receita líquida <b className="num" style={{color:'var(--fg-2)'}}>{window.fmtBRL(total)}</b></p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">↓ Exportar CSV</button>
          <button className="app-btn app-btn-neutral">↓ Espelho NFC-e</button>
          <button className="app-btn app-btn-accent">Nova venda</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginBottom:18}}>
        {[
          { label:'Vendas concluídas', value: vendas.filter(v=>v.status==='concluida').length,                              t:null },
          { label:'Ticket médio',       value: window.fmtBRL(total / vendas.filter(v=>v.status==='concluida').length || 0), t:null },
          { label:'Cancelamentos',      value: vendas.filter(v=>v.status==='cancelada').length,                             t:'warn' },
          { label:'Devoluções',         value: vendas.filter(v=>v.status==='devolvida').length,                             t:'err' },
        ].map((k) => (
          <div key={k.label} className="proto-panel" style={{padding:14}}>
            <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>{k.label}</div>
            <div className="num" style={{fontSize:22, fontWeight:700, marginTop:6, color: k.t === 'err' ? '#fca5a5' : k.t === 'warn' ? '#fde68a' : 'var(--fg-1)'}}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="proto-filterbar">
        <input type="search" placeholder="Buscar por #ID, cliente, SKU ou valor…" />
        <button className="app-chip">Hoje</button>
        <button className="app-chip">Últimos 7 dias</button>
        <button className="app-chip">Período…</button>
        <button className="app-chip">Operador: todos</button>
      </div>

      <div className="proto-tabs">
        {filtros.map((f) => (
          <button key={f.id} className={'proto-tab' + (filtro === f.id ? ' active' : '')} onClick={()=>setFiltro(f.id)}>
            {f.label} <span style={{opacity:0.6, marginLeft:6, fontFamily:'var(--font-numeric)'}}>{f.n}</span>
          </button>
        ))}
      </div>

      <div className="proto-panel" style={{padding:0, overflow:'hidden'}}>
        <table className="proto-table">
          <thead>
            <tr>
              <th>#ID</th><th>Hora</th><th>Cliente</th><th>Operador</th><th style={{textAlign:'right'}}>Itens</th><th style={{textAlign:'right'}}>Total</th><th>Método</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredVendas.map((v) => (
              <tr key={v.id} onClick={() => openDrawer(v)}>
                <td className="num"><b>#{v.id}</b></td>
                <td className="num" style={{color:'var(--fg-3)'}}>{window.fmtTime(v.data)}</td>
                <td>{v.cliente || <span style={{color:'var(--fg-3)'}}>—</span>}</td>
                <td><span style={{color:'var(--fg-2)'}}>{v.operador}</span> <span style={{color:'var(--fg-3)', fontSize:11}}>· caixa {v.caixa}</span></td>
                <td className="num" style={{textAlign:'right'}}>{v.itens}</td>
                <td className="num" style={{textAlign:'right', fontWeight:600, color: v.status === 'concluida' ? 'var(--fg-1)' : 'var(--fg-3)', textDecoration: v.status !== 'concluida' ? 'line-through' : 'none'}}>
                  {window.fmtBRL(v.total)}
                </td>
                <td><span style={{fontSize:12, color:'var(--fg-2)'}}>{v.metodo}</span></td>
                <td>
                  {v.status === 'concluida' && <span className="proto-pill ok">concluída</span>}
                  {v.status === 'devolvida' && <span className="proto-pill err">devolvida</span>}
                  {v.status === 'cancelada' && <span className="proto-pill warn">cancelada</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Produtos (lista + edição inline em drawer)
// ————————————————————————————————————————————————————
function ScreenProdutos() {
  const [filtroCategoria, setFiltroCategoria] = React.useState('todas');
  const [selected, setSelected] = React.useState(null);
  const produtos = window.PRODUTOS;
  const categorias = ['todas', ...new Set(produtos.map(p => p.categoria))];
  const list = filtroCategoria === 'todas' ? produtos : produtos.filter(p => p.categoria === filtroCategoria);

  return (
    <div className="proto-page" data-screen-label="produtos">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Catálogo · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>商品</span></p>
          <h1 className="proto-page-title">Produtos</h1>
          <p className="proto-page-sub">{produtos.length} SKUs ativos · 4 abaixo do estoque mínimo.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">↑ Importar CSV</button>
          <button className="app-btn app-btn-neutral">Etiquetas (impressão)</button>
          <button className="app-btn app-btn-accent">+ Novo produto</button>
        </div>
      </div>

      <div className="proto-filterbar">
        <input type="search" placeholder="Buscar por SKU, nome ou 中文 …" />
        <button className="app-chip">NCM / fiscal</button>
        <button className="app-chip">Fornecedor</button>
        <button className="app-chip">Margem &lt; 30 %</button>
      </div>

      <div className="proto-tabs">
        {categorias.map((c) => (
          <button key={c} className={'proto-tab' + (filtroCategoria === c ? ' active' : '')} onClick={()=>setFiltroCategoria(c)}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
            <span style={{opacity:0.6, marginLeft:6, fontFamily:'var(--font-numeric)'}}>
              {c === 'todas' ? produtos.length : produtos.filter(p=>p.categoria === c).length}
            </span>
          </button>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns: selected ? 'minmax(0,1fr) 420px' : '1fr', gap:18, alignItems:'flex-start'}}>
        <div className="proto-panel" style={{padding:0}}>
          <table className="proto-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th style={{textAlign:'right'}}>Custo</th>
                <th style={{textAlign:'right'}}>Preço</th>
                <th style={{textAlign:'right'}}>Margem</th>
                <th style={{textAlign:'right'}}>Estoque</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const margem = ((p.preco - p.custo) / p.preco) * 100;
                const lowStock = p.estoque < p.minimo;
                return (
                  <tr key={p.sku} onClick={() => setSelected(p)} className={selected?.sku === p.sku ? 'selected' : ''}>
                    <td className="num"><b>{p.sku}</b></td>
                    <td>
                      <div style={{fontWeight:600}}>{p.nome}</div>
                      <div style={{fontSize:11, color:'var(--fg-3)', letterSpacing:'0.02em'}}>{p.han}</div>
                    </td>
                    <td><span style={{fontSize:12, color:'var(--fg-2)'}}>{p.categoria}</span></td>
                    <td className="num" style={{textAlign:'right', color:'var(--fg-3)'}}>{window.fmtBRL(p.custo)}</td>
                    <td className="num" style={{textAlign:'right', fontWeight:600}}>{window.fmtBRL(p.preco)}</td>
                    <td className="num" style={{textAlign:'right', color: margem > 50 ? '#6ee7b7' : margem > 30 ? 'var(--fg-1)' : '#fde68a'}}>
                      {margem.toFixed(0)}%
                    </td>
                    <td className="num" style={{textAlign:'right'}}>
                      <b>{p.estoque}</b>
                      {lowStock && <span className="proto-pill err" style={{marginLeft:8, fontSize:10}}>baixo</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="proto-panel" style={{position:'sticky', top:50}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
              <div>
                <p className="proto-eyebrow" style={{margin:0, marginBottom:4}}>{selected.sku}</p>
                <h2 className="proto-panel-title" style={{margin:0}}>{selected.nome}</h2>
                <div style={{fontSize:13, color:'var(--fg-3)', marginTop:4, letterSpacing:'0.02em'}}>{selected.han}</div>
              </div>
              <button className="proto-modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{
              width:'100%', aspectRatio:'4/3', borderRadius:10,
              background:`linear-gradient(135deg, rgba(251,191,36,0.10), rgba(15,23,42,0.6)), url('../../assets/dragon-principal-bg.png')`,
              backgroundSize:'cover', backgroundPosition:'center',
              border:'1px solid var(--border-1)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'var(--font-serif-han)', fontSize:48, color:'rgba(251,191,36,0.5)',
              marginBottom:18,
            }}>{selected.han.slice(0, 2)}</div>

            <div style={{display:'grid', gap:14}}>
              <div className="proto-field-row">
                <div className="proto-field">
                  <label>Preço de venda</label>
                  <input defaultValue={selected.preco.toFixed(2).replace('.', ',')} />
                </div>
                <div className="proto-field">
                  <label>Custo</label>
                  <input defaultValue={selected.custo.toFixed(2).replace('.', ',')} />
                </div>
              </div>
              <div className="proto-field-row">
                <div className="proto-field">
                  <label>Estoque atual</label>
                  <input defaultValue={selected.estoque} />
                </div>
                <div className="proto-field">
                  <label>Estoque mínimo</label>
                  <input defaultValue={selected.minimo} />
                </div>
              </div>
              <div className="proto-field">
                <label>Fornecedor</label>
                <select defaultValue={selected.fornecedor}>
                  {window.FORNECEDORES.map(f => <option key={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div className="proto-field">
                <label>NCM</label>
                <input defaultValue={selected.ncm} />
              </div>

              <hr className="app-divider" />
              <div style={{display:'flex', gap:10}}>
                <button className="app-btn app-btn-neutral" style={{flex:1}}>Ver histórico de vendas</button>
                <button className="app-btn app-btn-accent" style={{flex:1}}>Salvar alterações</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Estoque (entradas / ajustes / contagem)
// ————————————————————————————————————————————————————
function ScreenEstoque() {
  const [tab, setTab] = React.useState('atual');
  const produtos = window.PRODUTOS;

  return (
    <div className="proto-page" data-screen-label="estoque">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Inventário · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>库存</span></p>
          <h1 className="proto-page-title">Estoque</h1>
          <p className="proto-page-sub">Estoque atual, entradas, ajustes e contagem cíclica.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">Nova contagem</button>
          <button className="app-btn app-btn-accent">+ Lançar entrada manual</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginBottom:18}}>
        <div className="proto-panel" style={{padding:14}}>
          <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Valor de estoque</div>
          <div className="num" style={{fontSize:22, fontWeight:700, marginTop:6}}>{window.fmtBRL(produtos.reduce((s,p)=>s+p.custo*p.estoque, 0))}</div>
          <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>a custo · {produtos.reduce((s,p)=>s+p.estoque, 0)} un</div>
        </div>
        <div className="proto-panel" style={{padding:14}}>
          <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>SKUs ativos</div>
          <div className="num" style={{fontSize:22, fontWeight:700, marginTop:6}}>{produtos.length}</div>
        </div>
        <div className="proto-panel" style={{padding:14}}>
          <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Abaixo do mínimo</div>
          <div className="num" style={{fontSize:22, fontWeight:700, marginTop:6, color:'#fca5a5'}}>{produtos.filter(p=>p.estoque < p.minimo).length}</div>
        </div>
        <div className="proto-panel" style={{padding:14}}>
          <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Última contagem</div>
          <div style={{fontSize:14, fontWeight:600, marginTop:6}}>há 12 dias</div>
          <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>conformidade 98,2%</div>
        </div>
      </div>

      <div className="proto-tabs">
        <button className={'proto-tab' + (tab==='atual'?' active':'')} onClick={()=>setTab('atual')}>Estoque atual</button>
        <button className={'proto-tab' + (tab==='entradas'?' active':'')} onClick={()=>setTab('entradas')}>Entradas e saídas</button>
        <button className={'proto-tab' + (tab==='contagem'?' active':'')} onClick={()=>setTab('contagem')}>Contagem cíclica</button>
        <button className={'proto-tab' + (tab==='ajustes'?' active':'')} onClick={()=>setTab('ajustes')}>Ajustes manuais</button>
      </div>

      {tab === 'atual' && (
        <div className="proto-panel" style={{padding:0}}>
          <table className="proto-table">
            <thead>
              <tr><th>SKU</th><th>Produto</th><th style={{textAlign:'right'}}>Atual</th><th style={{textAlign:'right'}}>Mín.</th><th style={{textAlign:'right'}}>Custo un.</th><th style={{textAlign:'right'}}>Valor</th><th>Status</th></tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const low = p.estoque < p.minimo;
                return (
                  <tr key={p.sku}>
                    <td className="num"><b>{p.sku}</b></td>
                    <td><div style={{fontWeight:600}}>{p.nome}</div><div style={{fontSize:11, color:'var(--fg-3)', letterSpacing:'0.02em'}}>{p.han}</div></td>
                    <td className="num" style={{textAlign:'right', fontWeight:700, color: low ? '#fca5a5' : 'var(--fg-1)'}}>{p.estoque}</td>
                    <td className="num" style={{textAlign:'right', color:'var(--fg-3)'}}>{p.minimo}</td>
                    <td className="num" style={{textAlign:'right', color:'var(--fg-3)'}}>{window.fmtBRL(p.custo)}</td>
                    <td className="num" style={{textAlign:'right'}}>{window.fmtBRL(p.custo * p.estoque)}</td>
                    <td>{low ? <span className="proto-pill err">repor +{p.minimo - p.estoque}</span> : <span className="proto-pill ok">ok</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'entradas' && (
        <div className="proto-panel" style={{padding:0}}>
          <table className="proto-table">
            <thead><tr><th>Data</th><th>Tipo</th><th>Documento</th><th>SKU / Produto</th><th style={{textAlign:'right'}}>Qtd</th><th>Origem / destino</th></tr></thead>
            <tbody>
              {[
                { d: window.minutosAtras(60), tipo:'Entrada · NF-e', doc:'#220', sku:'JL-0142', nome:'Taça de chá pintada à mão', qty:+12, org:'Yiwu Imports' },
                { d: window.minutosAtras(120), tipo:'Saída · venda',  doc:'#1208', sku:'JL-0501', nome:'Bule de porcelana — dragão', qty:-1, org:'Caixa 01' },
                { d: window.minutosAtras(420), tipo:'Ajuste',        doc:'AJ-018', sku:'JL-0203', nome:'Lanterna de papel vermelha', qty:-2, org:'Avaria' },
                { d: window.minutosAtras(820), tipo:'Entrada · NF-e', doc:'#218', sku:'JL-0288', nome:'Incenso de sândalo', qty:+86, org:'Fujian Sandalwood' },
                { d: window.minutosAtras(1440), tipo:'Saída · transferência', doc:'TR-04', sku:'JL-0612', nome:'Hashis de madeira', qty:-20, org:'Loja Liberdade' },
              ].map((m, i) => (
                <tr key={i}>
                  <td className="num" style={{color:'var(--fg-3)'}}>{window.fmtDateTime(m.d)}</td>
                  <td><span style={{fontSize:12, color: m.qty > 0 ? '#6ee7b7' : '#fca5a5'}}>{m.tipo}</span></td>
                  <td className="num"><b>{m.doc}</b></td>
                  <td><div style={{fontWeight:600, fontSize:13}}>{m.nome}</div><div style={{fontSize:11, color:'var(--fg-3)'}}>{m.sku}</div></td>
                  <td className="num" style={{textAlign:'right', fontWeight:700, color: m.qty > 0 ? '#6ee7b7' : '#fca5a5'}}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                  <td><span style={{fontSize:12, color:'var(--fg-2)'}}>{m.org}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'contagem' && (
        <div className="proto-panel">
          <h2 className="proto-panel-title">Contagem em andamento · CC-046</h2>
          <p className="proto-panel-sub">Iniciada há 28 minutos por Mei Lin · {produtos.length} SKUs no lote · 6 conferidos.</p>
          <div style={{marginTop:14, marginBottom:14, height:8, borderRadius:4, background:'rgba(15,23,42,0.6)', overflow:'hidden'}}>
            <div style={{width:'30%', height:'100%', background:'linear-gradient(90deg, var(--accent), var(--accent-deep))'}}></div>
          </div>
          <table className="proto-table">
            <thead><tr><th>SKU</th><th>Produto</th><th style={{textAlign:'right'}}>Sistema</th><th style={{textAlign:'right'}}>Contado</th><th style={{textAlign:'right'}}>Diferença</th><th>Status</th></tr></thead>
            <tbody>
              {produtos.slice(0,8).map((p, i) => {
                const contado = i < 6 ? p.estoque + (i === 2 ? -2 : i === 4 ? 1 : 0) : null;
                const dif = contado == null ? null : contado - p.estoque;
                return (
                  <tr key={p.sku}>
                    <td className="num"><b>{p.sku}</b></td>
                    <td><div style={{fontWeight:600}}>{p.nome}</div></td>
                    <td className="num" style={{textAlign:'right', color:'var(--fg-3)'}}>{p.estoque}</td>
                    <td className="num" style={{textAlign:'right', fontWeight:600}}>{contado ?? <span style={{color:'var(--fg-3)'}}>—</span>}</td>
                    <td className="num" style={{textAlign:'right'}}>
                      {dif == null ? <span style={{color:'var(--fg-3)'}}>—</span> :
                       dif === 0 ? <span className="proto-pill ok">ok</span> :
                       <span className={'proto-pill ' + (dif > 0 ? 'warn' : 'err')}>{dif > 0 ? '+' : ''}{dif}</span>}
                    </td>
                    <td>{contado == null ? <span style={{color:'var(--fg-3)'}}>aguardando</span> : <span style={{color:'#6ee7b7', fontSize:12}}>conferido</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ajustes' && (
        <div className="proto-panel">
          <h2 className="proto-panel-title">Lançar ajuste manual</h2>
          <p className="proto-panel-sub">Requer motivo e aprovação do gerente. Vai para o log fiscal.</p>
          <div style={{display:'grid', gap:14, maxWidth:680, marginTop:14}}>
            <div className="proto-field-row">
              <div className="proto-field"><label>Produto</label><select><option>Buscar SKU ou nome…</option></select></div>
              <div className="proto-field"><label>Tipo de ajuste</label><select><option>Avaria</option><option>Perda</option><option>Diferença de contagem</option><option>Devolução de cliente</option></select></div>
            </div>
            <div className="proto-field-row-3">
              <div className="proto-field"><label>Atual</label><input defaultValue="—" disabled /></div>
              <div className="proto-field"><label>Ajuste</label><input placeholder="ex.: −2" /></div>
              <div className="proto-field"><label>Novo total</label><input defaultValue="—" disabled /></div>
            </div>
            <div className="proto-field"><label>Observação</label><textarea placeholder="Descreva o motivo do ajuste…" /></div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:10}}>
              <button className="app-btn app-btn-neutral">Limpar</button>
              <button className="app-btn app-btn-accent">Solicitar aprovação <span style={{fontFamily:'var(--font-serif-han)', marginLeft:6}}>印</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.ScreenInicio = ScreenInicio;
window.ScreenHistorico = ScreenHistorico;
window.ScreenProdutos = ScreenProdutos;
window.ScreenEstoque = ScreenEstoque;
