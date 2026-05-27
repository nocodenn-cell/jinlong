// gerente-screens-2.jsx — Clientes, Fornecedores, NF-e import, Financeiro.

// ————————————————————————————————————————————————————
// Clientes (lista + ficha + crediário)
// ————————————————————————————————————————————————————
function ScreenClientes() {
  const clientes = window.CLIENTES;
  const [selected, setSelected] = React.useState(clientes[1]); // Restaurante Sakura — bom exemplo c/ crediário
  const totalCrediario = clientes.reduce((s, c) => s + c.crediario, 0);

  return (
    <div className="proto-page" data-screen-label="clientes">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">CRM · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>客户</span></p>
          <h1 className="proto-page-title">Clientes</h1>
          <p className="proto-page-sub">{clientes.length} clientes ativos · crediário aberto <b className="num" style={{color:'var(--fg-2)'}}>{window.fmtBRL(totalCrediario)}</b></p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">↓ Exportar lista</button>
          <button className="app-btn app-btn-accent">+ Novo cliente</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0, 1fr) 460px', gap:18, alignItems:'flex-start'}}>
        <div>
          <div className="proto-filterbar">
            <input type="search" placeholder="Buscar por nome, CPF/CNPJ, telefone…" />
            <button className="app-chip">PF</button>
            <button className="app-chip">PJ</button>
            <button className="app-chip">Com crediário</button>
            <button className="app-chip">Inativos</button>
          </div>
          <div className="proto-panel" style={{padding:0}}>
            <table className="proto-table">
              <thead>
                <tr><th>Cliente</th><th>Documento</th><th style={{textAlign:'right'}}>Compras</th><th>Última</th><th style={{textAlign:'right'}}>Crediário</th><th>Status</th></tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} onClick={()=>setSelected(c)} className={selected?.id === c.id ? 'selected' : ''}>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <span className="proto-avatar" style={{width:32, height:32, fontSize:12}}>
                          {c.nome.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase()}
                        </span>
                        <div>
                          <div style={{fontWeight:600}}>{c.nome}</div>
                          <div style={{fontSize:11, color:'var(--fg-3)'}}>{c.tipo === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num" style={{color:'var(--fg-3)'}}>{c.doc}</td>
                    <td className="num" style={{textAlign:'right', fontWeight:600}}>{c.compras}</td>
                    <td className="num" style={{color:'var(--fg-3)'}}>{window.fmtDate(c.ultimaCompra)}</td>
                    <td className="num" style={{textAlign:'right'}}>
                      {c.crediario > 0
                        ? <b style={{color:'#fde68a'}}>{window.fmtBRL(c.crediario)}</b>
                        : <span style={{color:'var(--fg-3)'}}>—</span>}
                    </td>
                    <td>
                      {c.status === 'ativo'
                        ? <span className="proto-pill ok">ativo</span>
                        : <span className="proto-pill muted">inativo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div style={{position:'sticky', top:50}}>
            <div className="proto-panel">
              <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14}}>
                <div style={{display:'flex', alignItems:'center', gap:14}}>
                  <span className="proto-avatar" style={{width:52, height:52, fontSize:18}}>
                    {selected.nome.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase()}
                  </span>
                  <div>
                    <h2 className="proto-panel-title" style={{margin:0}}>{selected.nome}</h2>
                    <div style={{fontSize:12, color:'var(--fg-3)', marginTop:4}}>{selected.tipo === 'PJ' ? 'CNPJ' : 'CPF'} {selected.doc}</div>
                  </div>
                </div>
                <button className="proto-modal-close" onClick={()=>setSelected(null)}>✕</button>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18}}>
                <div style={{padding:'10px 12px', borderRadius:8, background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)'}}>
                  <div style={{fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Compras totais</div>
                  <div className="num" style={{fontSize:20, fontWeight:700, marginTop:4}}>{selected.compras}</div>
                </div>
                <div style={{padding:'10px 12px', borderRadius:8, background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)'}}>
                  <div style={{fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Limite crediário</div>
                  <div className="num" style={{fontSize:20, fontWeight:700, marginTop:4}}>{window.fmtBRL(selected.limite)}</div>
                </div>
              </div>

              <div style={{display:'grid', gap:8, fontSize:13, marginBottom:18}}>
                <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>Telefone</span><span className="num">{selected.telefone}</span></div>
                <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>E-mail</span><span style={{color:'var(--fg-2)'}}>{selected.email}</span></div>
                <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>Última compra</span><span className="num">{window.fmtDateTime(selected.ultimaCompra)}</span></div>
              </div>

              {selected.crediario > 0 && (
                <>
                  <p className="proto-eyebrow" style={{marginBottom:8}}>Crediário em aberto · <span style={{fontFamily:'var(--font-serif-han)', color:'var(--accent)', letterSpacing:'0.08em'}}>挂账</span></p>
                  <div style={{
                    padding:'14px 16px', borderRadius:10,
                    background: selected.crediario > selected.limite * 0.7 ? 'rgba(127,29,29,0.22)' : 'color-mix(in srgb, var(--accent-strong) 14%, transparent)',
                    border: '1px solid ' + (selected.crediario > selected.limite * 0.7 ? 'rgba(239,68,68,0.42)' : 'color-mix(in srgb, var(--accent) 32%, var(--border-1))'),
                    marginBottom:18,
                  }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                      <span style={{fontSize:12, color:'var(--fg-3)'}}>{Math.round((selected.crediario/selected.limite)*100)}% do limite usado</span>
                      <span className="num" style={{fontSize:22, fontWeight:800, color:'var(--accent)'}}>{window.fmtBRL(selected.crediario)}</span>
                    </div>
                    <div style={{height:6, background:'rgba(2,6,23,0.6)', borderRadius:3, marginTop:10, overflow:'hidden'}}>
                      <div style={{
                        width: Math.min(100, (selected.crediario/selected.limite)*100) + '%', height:'100%',
                        background:'linear-gradient(90deg, var(--accent), var(--accent-deep))',
                      }}></div>
                    </div>
                  </div>

                  <p className="proto-eyebrow" style={{marginBottom:8}}>Extrato (últimas movimentações)</p>
                  <div style={{borderRadius:10, border:'1px solid var(--border-1)', background:'rgba(2,6,23,0.35)', overflow:'hidden'}}>
                    {window.EXTRATO_RESTAURANTE_SAKURA.slice(0, 5).map((m, i) => (
                      <div key={i} style={{
                        display:'grid', gridTemplateColumns:'auto 1fr auto', gap:12,
                        padding:'10px 14px',
                        borderBottom: i < 4 ? '1px solid rgba(148,163,184,0.14)' : 'none',
                        alignItems:'center',
                      }}>
                        <div className="num" style={{fontSize:11, color:'var(--fg-3)'}}>{window.fmtDate(m.data)}</div>
                        <div>
                          <div style={{fontSize:12, color:'var(--fg-1)'}}>{m.desc}</div>
                          <div style={{fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.10em', marginTop:2}}>{m.tipo}</div>
                        </div>
                        <div className="num" style={{fontWeight:700, color: m.valor > 0 ? '#6ee7b7' : '#fca5a5', fontSize:13}}>
                          {m.valor > 0 ? '+' : ''}{window.fmtBRL(m.valor)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{display:'flex', gap:8, marginTop:18}}>
                <button className="app-btn app-btn-neutral" style={{flex:1}}>Editar ficha</button>
                {selected.crediario > 0 && <button className="app-btn app-btn-accent" style={{flex:1}}>Receber pagamento</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Fornecedores
// ————————————————————————————————————————————————————
function ScreenFornecedores() {
  const fornecedores = window.FORNECEDORES;
  const [selected, setSelected] = React.useState(null);

  return (
    <div className="proto-page" data-screen-label="fornecedores">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Suprimentos · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>供应商</span></p>
          <h1 className="proto-page-title">Fornecedores</h1>
          <p className="proto-page-sub">{fornecedores.length} fornecedores · 6 chineses, 1 japonês.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">Mapa de origem</button>
          <button className="app-btn app-btn-accent">+ Novo fornecedor</button>
        </div>
      </div>

      <div className="proto-filterbar">
        <input type="search" placeholder="Buscar por nome, CNPJ ou categoria…" />
        <button className="app-chip">China</button>
        <button className="app-chip">Japão</button>
        <button className="app-chip">Atrasados</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:16}}>
        {fornecedores.map((f) => {
          const cores = {
            'Decoração':'#fde68a', 'Cozinha':'#bae6fd', 'Joias':'#fca5a5',
            'Aromas':'#c4b5fd', 'Chás':'#a7f3d0', 'Vestuário':'#fbcfe8',
            'Papelaria':'#fed7aa', 'Acessórios':'#e9d5ff',
          };
          return (
            <div key={f.id} className="proto-panel" style={{padding:18, cursor:'pointer'}} onClick={()=>setSelected(f)}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
                <div>
                  <h3 style={{margin:0, fontSize:15, fontWeight:600, color:'var(--fg-1)'}}>{f.nome}</h3>
                  <div style={{fontSize:11, color:'var(--fg-3)', marginTop:4, fontFamily:'var(--font-numeric)'}}>{f.cnpj}</div>
                </div>
                <span style={{
                  padding:'3px 8px', borderRadius:999, fontSize:10, fontWeight:600,
                  background:'rgba(15,23,42,0.6)', color: cores[f.categoria] || 'var(--fg-2)',
                  border:'1px solid var(--border-1)',
                }}>{f.categoria}</span>
              </div>

              <div style={{display:'grid', gap:8, fontSize:12}}>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--fg-3)'}}>Contato</span>
                  <span style={{color:'var(--fg-2)'}}>{f.contato}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--fg-3)'}}>Prazo médio</span>
                  <span className="num"><b style={{color:'var(--fg-1)'}}>{f.prazoMedio}</b> dias</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--fg-3)'}}>Última NF-e</span>
                  <span className="num" style={{color:'var(--fg-2)'}}>há {Math.floor((window.HOJE - f.ultimaNFe)/(86400000))} d</span>
                </div>
              </div>

              <hr className="app-divider" style={{margin:'14px 0'}} />
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                <span style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.10em'}}>Comprado · 12 m</span>
                <span className="num" style={{fontSize:18, fontWeight:700, color:'var(--accent)'}}>{window.fmtBRL(f.totalAno)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="proto-modal-backdrop" onClick={()=>setSelected(null)}>
          <div className="proto-modal" style={{maxWidth:640}} onClick={(e)=>e.stopPropagation()}>
            <div className="proto-modal-head">
              <div>
                <p className="proto-eyebrow" style={{margin:0, marginBottom:4}}>Ficha do fornecedor</p>
                <h2 className="proto-modal-title">{selected.nome}</h2>
                <p className="proto-modal-sub">{selected.cnpj} · {selected.categoria}</p>
              </div>
              <button className="proto-modal-close" onClick={()=>setSelected(null)}>✕</button>
            </div>
            <div className="proto-modal-body">
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                <div className="proto-field"><label>Contato</label><input defaultValue={selected.contato} /></div>
                <div className="proto-field"><label>Telefone</label><input defaultValue={selected.telefone} /></div>
                <div className="proto-field"><label>E-mail</label><input defaultValue={selected.email} /></div>
                <div className="proto-field"><label>Prazo médio (dias)</label><input defaultValue={selected.prazoMedio} /></div>
              </div>
            </div>
            <div className="proto-modal-foot">
              <button className="app-btn app-btn-neutral" onClick={()=>setSelected(null)}>Cancelar</button>
              <button className="app-btn app-btn-accent">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————
// Importação de NF-e (drag-drop XML + conciliação)
// ————————————————————————————————————————————————————
function ScreenNfe() {
  const [tab, setTab] = React.useState('pendentes');
  const [conciliando, setConciliando] = React.useState(null);

  return (
    <div className="proto-page" data-screen-label="nfe">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Recebimento fiscal · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>电子发票</span></p>
          <h1 className="proto-page-title">Importação de NF-e</h1>
          <p className="proto-page-sub">3 notas pendentes · arraste o XML para começar.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">Consultar SEFAZ</button>
          <button className="app-btn app-btn-accent">+ Lançar entrada manual</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0, 1.4fr) minmax(0, 1fr)', gap:22}}>
        <div>
          {/* Drop zone */}
          <div style={{
            border:'2px dashed color-mix(in srgb, var(--accent) 45%, var(--border-1))',
            borderRadius:14,
            padding:'40px 24px',
            textAlign:'center',
            background:'color-mix(in srgb, var(--accent-strong) 6%, transparent)',
            marginBottom:18,
          }}>
            <div style={{fontSize:48, marginBottom:8, color:'var(--accent)'}}>↥</div>
            <h3 style={{margin:'0 0 6px', fontSize:15, fontWeight:600, color:'var(--fg-1)'}}>
              Arraste XML de NF-e aqui <span style={{fontFamily:'var(--font-serif-han)', color:'var(--accent)', marginLeft:8, letterSpacing:'0.08em'}}>拖放</span>
            </h3>
            <p style={{margin:0, fontSize:12, color:'var(--fg-3)'}}>ou <a href="#" style={{color:'var(--accent)', textDecoration:'underline', textUnderlineOffset:3}}>selecione arquivos</a> · até 50 MB por XML</p>
          </div>

          <div className="proto-tabs">
            <button className={'proto-tab' + (tab==='pendentes'?' active':'')} onClick={()=>setTab('pendentes')}>Pendentes <span style={{opacity:0.6, marginLeft:6, fontFamily:'var(--font-numeric)'}}>3</span></button>
            <button className={'proto-tab' + (tab==='processadas'?' active':'')} onClick={()=>setTab('processadas')}>Processadas <span style={{opacity:0.6, marginLeft:6, fontFamily:'var(--font-numeric)'}}>146</span></button>
            <button className={'proto-tab' + (tab==='erros'?' active':'')} onClick={()=>setTab('erros')}>Erros <span style={{opacity:0.6, marginLeft:6, fontFamily:'var(--font-numeric)'}}>2</span></button>
          </div>

          <div className="proto-panel" style={{padding:0}}>
            <table className="proto-table">
              <thead><tr><th>Nº</th><th>Emissor</th><th>Data</th><th style={{textAlign:'right'}}>Itens</th><th style={{textAlign:'right'}}>Valor</th><th>Divergências</th><th>Ação</th></tr></thead>
              <tbody>
                {window.NFE_IMPORTS.map((n) => (
                  <tr key={n.id} onClick={()=>n.status === 'pendente' && setConciliando(n)}>
                    <td className="num"><b>#{n.numero}</b></td>
                    <td>{n.emissor}</td>
                    <td className="num" style={{color:'var(--fg-3)'}}>{window.fmtDate(n.data)}</td>
                    <td className="num" style={{textAlign:'right'}}>{n.itens}</td>
                    <td className="num" style={{textAlign:'right', fontWeight:600}}>{window.fmtBRL(n.valor)}</td>
                    <td>
                      {n.divergencias > 0
                        ? <span className="proto-pill warn">{n.divergencias} divergência{n.divergencias > 1 ? 's' : ''}</span>
                        : <span className="proto-pill ok">sem divergências</span>}
                    </td>
                    <td>
                      {n.status === 'pendente' && <button className="app-btn app-btn-accent app-btn-sm" onClick={(e)=>{e.stopPropagation(); setConciliando(n);}}>Conciliar →</button>}
                      {n.status === 'processada' && <span className="proto-pill ok">processada</span>}
                      {n.status === 'erro' && <span className="proto-pill err">erro · revisar</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar — conciliação ou guia */}
        <div style={{position:'sticky', top:50}}>
          {conciliando ? (
            <div className="proto-panel">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
                <div>
                  <p className="proto-eyebrow" style={{margin:0, marginBottom:4}}>Conciliando NF-e #{conciliando.numero}</p>
                  <h2 className="proto-panel-title">{conciliando.emissor}</h2>
                  <p className="proto-panel-sub">{window.fmtDate(conciliando.data)} · {window.fmtBRL(conciliando.valor)} · {conciliando.itens} itens</p>
                </div>
                <button className="proto-modal-close" onClick={()=>setConciliando(null)}>✕</button>
              </div>

              <div style={{
                padding:'10px 14px', borderRadius:10,
                background:'rgba(127,29,29,0.18)', border:'1px solid rgba(239,68,68,0.42)',
                fontSize:12, color:'#fecaca', marginBottom:18,
              }}>
                <b style={{display:'block', marginBottom:2, color:'#fecaca'}}>3 divergências encontradas</b>
                1 produto novo · 1 preço diferente · 1 quantidade diferente.
              </div>

              <div style={{display:'flex', flexDirection:'column', gap:10}}>
                {window.NFE_219_ITENS.map((it) => (
                  <div key={it.sku} style={{
                    padding:'12px 14px', borderRadius:10,
                    border:'1px solid ' + (it.match === 'ok' ? 'rgba(16,185,129,0.32)' : it.match === 'novo' ? 'rgba(96,165,250,0.42)' : 'rgba(251,191,36,0.42)'),
                    background:'rgba(2,6,23,0.45)',
                  }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <div>
                        <div style={{fontWeight:600, fontSize:13}}>{it.nome}</div>
                        <div style={{fontSize:11, color:'var(--fg-3)'}}>{it.sku} · <span style={{letterSpacing:'0.02em'}}>{it.han}</span></div>
                      </div>
                      <span className={'proto-pill ' + (it.match === 'ok' ? 'ok' : it.match === 'novo' ? 'muted' : 'warn')}>
                        {it.match === 'ok' ? 'casou' : it.match === 'novo' ? 'novo SKU' : 'preço ↑'}
                      </span>
                    </div>
                    <div className="num" style={{fontSize:11, color:'var(--fg-3)', marginTop:6}}>
                      qty <b style={{color:'var(--fg-2)'}}>{it.qty}</b> × {window.fmtBRL(it.preco)} = <b style={{color:'var(--fg-1)'}}>{window.fmtBRL(it.qty*it.preco)}</b>
                    </div>
                  </div>
                ))}
              </div>

              <hr className="app-divider" style={{margin:'18px 0'}} />
              <div style={{display:'flex', gap:8}}>
                <button className="app-btn app-btn-neutral" style={{flex:1}} onClick={()=>setConciliando(null)}>Cancelar</button>
                <button className="app-btn app-btn-accent" style={{flex:1}} onClick={()=>setConciliando(null)}>Importar e atualizar estoque</button>
              </div>
            </div>
          ) : (
            <>
              <div className="proto-panel" style={{marginBottom:18}}>
                <h2 className="proto-panel-title">Como funciona</h2>
                <ol style={{margin:0, paddingLeft:18, color:'var(--fg-2)', fontSize:13, lineHeight:1.7}}>
                  <li>Arraste o XML emitido pelo fornecedor (ou puxe direto da SEFAZ).</li>
                  <li>O sistema casa cada item com o seu catálogo por SKU / EAN.</li>
                  <li>Divergências de preço, NCM ou produto novo aparecem destacadas.</li>
                  <li>Você decide importar, vincular SKU ou criar produto novo.</li>
                  <li>Estoque e CMV são atualizados na confirmação.</li>
                </ol>
              </div>
              <div className="proto-panel">
                <h2 className="proto-panel-title">Última importação</h2>
                <p className="proto-panel-sub">NF-e #220 · Yiwu Imports · ontem.</p>
                <div style={{display:'grid', gap:8, fontSize:13}}>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>Itens importados</span><span className="num"><b>48</b></span></div>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>Novos SKUs criados</span><span className="num">2</span></div>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>Total importado</span><span className="num" style={{color:'var(--accent)', fontWeight:700}}>{window.fmtBRL(8240)}</span></div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Relatórios financeiros (DRE, fluxo, faturamento)
// ————————————————————————————————————————————————————
function ScreenFinanceiro() {
  const dre = window.FINANCEIRO_DRE_MAIO;
  const serie = window.SERIE_30D;
  const maxS = Math.max(...serie);

  return (
    <div className="proto-page" data-screen-label="financeiro">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Relatórios · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>财务报表</span></p>
          <h1 className="proto-page-title">Financeiro</h1>
          <p className="proto-page-sub">Maio de 2026 (parcial · até dia 14) · loja Paulista.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-chip app-chip-active">Mai/2026</button>
          <button className="app-chip">YTD</button>
          <button className="app-chip">Comparar</button>
          <button className="app-btn app-btn-neutral">↓ Exportar PDF</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginBottom:22}}>
        {[
          { label:'Receita bruta',   value: dre.receitaBruta,   sub:'mês parcial' },
          { label:'Lucro bruto',     value: dre.lucroBruto,     sub:`margem ${((dre.lucroBruto/dre.receitaLiquida)*100).toFixed(0)}%` },
          { label:'Lucro líquido',   value: dre.lucroLiquido,   sub:`margem ${((dre.lucroLiquido/dre.receitaLiquida)*100).toFixed(0)}%`, accent:true },
          { label:'Crediário aberto',value: window.CLIENTES.reduce((s,c)=>s+c.crediario, 0), sub:'a receber 30 d' },
        ].map((k) => (
          <div key={k.label} className="proto-panel" style={{padding:16}}>
            <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>{k.label}</div>
            <div className="num" style={{fontSize:24, fontWeight:700, marginTop:8, color: k.accent ? 'var(--accent)' : 'var(--fg-1)', lineHeight:1.1}}>{window.fmtBRL(k.value)}</div>
            <div style={{fontSize:11, color:'var(--fg-3)', marginTop:4}}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0,1.4fr) minmax(0,1fr)', gap:18}}>
        <div className="proto-panel">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
            <div>
              <h2 className="proto-panel-title">Faturamento — últimos 30 dias</h2>
              <p className="proto-panel-sub">Tendência diária · 1º a 30º dia útil.</p>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.14em'}}>Média / dia</div>
              <div className="num" style={{fontSize:16, fontWeight:700, marginTop:2}}>{window.fmtBRL(serie.reduce((s,v)=>s+v, 0)/serie.length)}</div>
            </div>
          </div>
          <div className="proto-bars" style={{height:110}}>
            {serie.map((v, i) => (
              <div key={i} className="bar" style={{height: `${(v/maxS)*100}%`, opacity: i === serie.length-1 ? 1 : 0.85}} />
            ))}
          </div>
          <div style={{display:'flex', justifyContent:'space-between', fontFamily:'var(--font-numeric)', fontSize:10, color:'var(--fg-3)', marginTop:6}}>
            <span>15/abr</span><span>22/abr</span><span>29/abr</span><span>06/mai</span><span>14/mai</span>
          </div>
        </div>

        <div className="proto-panel">
          <h2 className="proto-panel-title">DRE — apuração mensal</h2>
          <p className="proto-panel-sub">Estrutura compacta · 损益表</p>
          <div style={{display:'grid', gap:10, marginTop:14, fontFamily:'var(--font-numeric)', fontSize:13}}>
            {[
              ['Receita bruta',     dre.receitaBruta,     false],
              ['(−) Deduções',      dre.deducoes,         false],
              ['Receita líquida',   dre.receitaLiquida,   true],
              ['(−) Custo mercadoria', dre.custoMercadoria, false],
              ['Lucro bruto',       dre.lucroBruto,       true],
              ['(−) Despesas operacionais', dre.despesasOper, false],
              ['(−) Despesas financeiras', dre.despesasFin,  false],
              ['Lucro líquido',     dre.lucroLiquido,     true, true],
            ].map(([label, val, bold, accent]) => (
              <div key={label} style={{
                display:'flex', justifyContent:'space-between',
                padding: bold ? '8px 0' : '4px 0',
                borderTop: bold ? '1px solid var(--border-1)' : 'none',
              }}>
                <span style={{color: bold ? 'var(--fg-1)' : 'var(--fg-3)', fontWeight: bold ? 600 : 400, fontFamily:'var(--font-sans)'}}>{label}</span>
                <span style={{
                  fontWeight: bold ? 700 : 500,
                  color: accent ? 'var(--accent)' : val < 0 ? '#fca5a5' : 'var(--fg-1)',
                  fontSize: accent ? 18 : 13,
                }}>{val < 0 ? '−' : ''}{window.fmtBRL(Math.abs(val))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginTop:18}}>
        <div className="proto-panel">
          <h2 className="proto-panel-title">Composição de receita por meio</h2>
          <p className="proto-panel-sub">Distribuição do mês.</p>
          <div style={{display:'grid', gap:14, marginTop:14}}>
            {window.FLUXO_CATEGORIAS.map((c) => (
              <div key={c.cat}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                  <span style={{fontSize:13, color:'var(--fg-2)'}}>{c.cat}</span>
                  <span className="num" style={{fontWeight:600}}>{window.fmtBRL(c.valor)} <span style={{color:'var(--fg-3)', fontWeight:400}}>· {c.share}%</span></span>
                </div>
                <div style={{height:8, borderRadius:4, background:'rgba(2,6,23,0.55)', overflow:'hidden'}}>
                  <div style={{width: c.share + '%', height:'100%', background:'linear-gradient(90deg, var(--accent), var(--accent-deep))'}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="proto-panel">
          <h2 className="proto-panel-title">Despesas do mês</h2>
          <p className="proto-panel-sub">Comparativo às maiores categorias.</p>
          <div style={{display:'grid', gap:10, marginTop:14}}>
            {window.DESPESAS_CATEGORIAS.map((d) => (
              <div key={d.cat} style={{display:'grid', gridTemplateColumns:'90px 1fr 100px', gap:12, alignItems:'center'}}>
                <span style={{fontSize:13, color:'var(--fg-2)'}}>{d.cat}</span>
                <div style={{height:6, borderRadius:3, background:'rgba(2,6,23,0.55)', overflow:'hidden'}}>
                  <div style={{width: (d.valor / 15000)*100 + '%', height:'100%', background:'linear-gradient(90deg, #fde68a, #f59e0b)'}}></div>
                </div>
                <span className="num" style={{textAlign:'right', fontWeight:600}}>{window.fmtBRL(d.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.ScreenClientes = ScreenClientes;
window.ScreenFornecedores = ScreenFornecedores;
window.ScreenNfe = ScreenNfe;
window.ScreenFinanceiro = ScreenFinanceiro;
