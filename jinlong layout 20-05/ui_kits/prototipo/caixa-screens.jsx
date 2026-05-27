// CaixaScreens.jsx — abertura, fechamento, devolução, pagamento expandido, recibo.
// Each component is a "screen" rendered by the router. All read from window.* data.

// ————————————————————————————————————————————————————
// Operar caixa (versão completa — cart + payment column + actions)
// ————————————————————————————————————————————————————
function ScreenCaixa({ openModal }) {
  const [items, setItems] = React.useState([
    { sku: 'JL-0142', nome: 'Taça de chá pintada à mão',     han: '手绘茶杯', qty: 2, preco: 38.00 },
    { sku: 'JL-0501', nome: 'Bule de porcelana — dragão',    han: '龙纹瓷壶', qty: 1, preco: 89.00 },
    { sku: 'JL-0288', nome: 'Incenso de sândalo (caixa 30 un.)', han: '檀香', qty: 1, preco: 18.90 },
  ]);
  const total = items.reduce((s, i) => s + i.qty * i.preco, 0);

  return (
    <div className="caixa-shell" data-screen-label="caixa">
      <section className="caixa-cart-side">
        <header className="caixa-shell-head">
          <div>
            <div className="caixa-shell-title">Caixa: 01 <span className="caixa-han" style={{marginLeft:8}}>收银台 01</span></div>
            <div className="caixa-shell-sub">Operador: João Wei · turno aberto há 10h 42min</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="app-chip" onClick={() => openModal('sangria')}>F5 · Sangria</button>
            <button className="app-chip" onClick={() => openModal('aprovacao')}>F3 · Desconto +10 %</button>
            <button className="app-chip">F4 · Cliente</button>
          </div>
        </header>

        <div style={{position:'relative', marginBottom: 14}}>
          <span style={{position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', color:'var(--fg-3)'}}>{window.NavIcon.search}</span>
          <input type="text" placeholder="Buscar por código, EAN ou nome (F2)…  搜索产品"
            style={{
              width:'100%', height:52, padding:'0 56px 0 50px',
              borderRadius:12, border:'2px solid var(--border-1)',
              background:'rgba(15, 23, 42, 0.42)', color:'var(--fg-1)',
              fontSize:17, fontFamily:'var(--font-sans)', outline:'none', boxSizing:'border-box',
            }} />
        </div>

        <div style={{flex:1, overflow:'auto', paddingRight:4}}>
          {items.map((it) => (
            <div key={it.sku} className="cart-item">
              <div>
                <div className="cart-item-name">{it.nome}</div>
                <div className="cart-item-meta">
                  <span>{it.sku}</span>
                  <span className="zh">{it.han}</span>
                  <span className="cart-item-unit">{window.fmtBRL(it.preco)} / un</span>
                </div>
              </div>
              <div className="qty-stepper">
                <button onClick={() => setItems(items.map(i => i.sku === it.sku ? {...i, qty: Math.max(1, i.qty-1)} : i))}>−</button>
                <span className="qty-val">{it.qty}</span>
                <button onClick={() => setItems(items.map(i => i.sku === it.sku ? {...i, qty: i.qty+1} : i))}>+</button>
              </div>
              <div className="cart-item-total">{window.fmtBRL(it.qty * it.preco)}</div>
              <button className="cart-item-remove" onClick={() => setItems(items.filter(i => i.sku !== it.sku))}>✕</button>
            </div>
          ))}
        </div>
      </section>

      <section className="caixa-pay-side">
        <div className="caixa-summary">
          <div className="caixa-totals-aux">
            <span>{items.length} itens · {items.reduce((s,i)=>s+i.qty,0)} un</span>
            <span>Subtotal {window.fmtBRL(total)}</span>
          </div>
          <div className="caixa-total-row" style={{marginTop:6}}>
            <span className="caixa-total-label">Total</span>
            <span className="caixa-total-val">{window.fmtBRL(total)}</span>
          </div>
        </div>

        <div className="pay-stack">
          <button className="pay-btn pay-btn-accent">
            <span className="glyph">⟁</span>
            <span>PIX <span className="key">(F8)</span></span>
          </button>
          <button className="pay-btn pay-btn-neutral">
            <span className="glyph">▭</span>
            <span>CARTÃO <span className="key">(F9)</span></span>
          </button>
          <button className="pay-btn pay-btn-subtle">
            <span className="glyph">¥</span>
            <span>DINHEIRO <span className="key">(F10)</span></span>
          </button>
        </div>

        <button className="app-btn app-btn-accent app-btn-lg" style={{marginTop:'auto', width:'100%'}}>
          Finalizar venda &nbsp; <span style={{opacity:0.7, fontSize:11}}>F12</span>
        </button>
      </section>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Abertura de caixa
// ————————————————————————————————————————————————————
function ScreenAbertura({ go }) {
  const [valor, setValor] = React.useState('150,00');
  const [operador, setOperador] = React.useState('joao');
  const [observacao, setObservacao] = React.useState('');
  const sugestoes = [50, 100, 150, 200, 300];

  return (
    <div className="proto-page" data-screen-label="abertura-caixa">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Início do turno · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>开班</span></p>
          <h1 className="proto-page-title">Abertura de caixa</h1>
          <p className="proto-page-sub">Confirme o operador e o valor inicial. Caixa 01 está fechado desde ontem às 22:14.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral" onClick={() => go('inicio')}>Cancelar</button>
          <button className="app-btn app-btn-accent" onClick={() => go('caixa')}>Abrir caixa &nbsp;<span style={{opacity:.7,fontSize:11}}>Enter</span></button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0, 1fr) 380px', gap:24}}>
        <div className="proto-panel">
          <h2 className="proto-panel-title">Dados de abertura</h2>
          <p className="proto-panel-sub">Tudo isto vai para o relatório de fechamento — preencha com atenção.</p>

          <div style={{display:'grid', gap:18}}>
            <div className="proto-field-row">
              <div className="proto-field">
                <label>Caixa</label>
                <select value="01" readOnly><option>01 · PDV principal</option></select>
              </div>
              <div className="proto-field">
                <label>Operador</label>
                <select value={operador} onChange={(e)=>setOperador(e.target.value)}>
                  <option value="joao">João Wei</option>
                  <option value="mei">Mei Lin</option>
                  <option value="suporte">Suporte TI</option>
                </select>
              </div>
            </div>

            <div className="proto-field">
              <label>Valor inicial (fundo de troco)</label>
              <div style={{display:'flex', gap:10, alignItems:'center'}}>
                <span style={{
                  height:40, display:'inline-flex', alignItems:'center', padding:'0 12px',
                  border:'1px solid var(--border-1)', borderRadius:8,
                  background:'rgba(2,6,23,0.55)', color:'var(--fg-3)', fontSize:14,
                }}>R$</span>
                <input type="text" value={valor} onChange={(e)=>setValor(e.target.value)}
                  style={{
                    flex:1, fontFamily:'var(--font-numeric)', fontSize:24, fontWeight:700,
                    fontVariantNumeric:'tabular-nums', textAlign:'right', height:56,
                    border:'1px solid var(--border-1)', borderRadius:8,
                    background:'rgba(2,6,23,0.45)', color:'var(--fg-1)', padding:'0 18px', outline:'none',
                  }} />
              </div>
              <div style={{display:'flex', gap:8, marginTop:10, flexWrap:'wrap'}}>
                {sugestoes.map((s) => (
                  <button key={s} className={'money-chip' + (Number(valor.replace(',', '.')) === s ? ' active' : '')}
                    onClick={() => setValor(s.toFixed(2).replace('.', ','))}>
                    R$ {s.toFixed(2).replace('.', ',')}
                  </button>
                ))}
              </div>
            </div>

            <div className="proto-field">
              <label>Observação (opcional)</label>
              <textarea placeholder="Ex.: troco vindo do cofre · conferido com gerente."
                value={observacao} onChange={(e)=>setObservacao(e.target.value)} />
            </div>

            <div style={{
              display:'flex', alignItems:'flex-start', gap:12,
              padding:'12px 14px', borderRadius:10,
              border:'1px solid color-mix(in srgb, var(--accent) 45%, var(--border-1))',
              background:'color-mix(in srgb, var(--accent-strong) 12%, transparent)',
              fontSize:13, color:'var(--fg-2)', lineHeight:1.5,
            }}>
              <span style={{color:'var(--accent)'}}>⚠</span>
              <span>O fundo de troco fica como <b style={{color:'var(--fg-1)'}}>saldo inicial</b> do caixa. No fechamento, a conferência subtrai este valor automaticamente.</span>
            </div>
          </div>
        </div>

        <div>
          <div className="proto-panel">
            <h2 className="proto-panel-title">Pré-fechamento de ontem</h2>
            <p className="proto-panel-sub">Caixa 01 · turno 13/05.</p>
            <div style={{display:'grid', gridTemplateColumns:'1fr auto', rowGap:10, fontSize:13}}>
              <span style={{color:'var(--fg-3)'}}>Vendas</span>
              <span className="num">{window.fmtBRL(3142.50)}</span>
              <span style={{color:'var(--fg-3)'}}>Dinheiro</span>
              <span className="num">{window.fmtBRL(412.00)}</span>
              <span style={{color:'var(--fg-3)'}}>Sangrias</span>
              <span className="num">−{window.fmtBRL(300.00)}</span>
              <span style={{color:'var(--fg-3)'}}>Saldo final</span>
              <span className="num" style={{color:'var(--accent)', fontWeight:700}}>{window.fmtBRL(262.00)}</span>
            </div>
            <hr className="app-divider" style={{margin:'14px 0'}} />
            <div style={{fontSize:12, color:'var(--fg-3)', lineHeight:1.5}}>
              Recomendado começar com <b style={{color:'var(--fg-1)'}}>R$ 150,00</b> em moedas e pequenas notas.
            </div>
          </div>

          <div className="proto-panel" style={{marginTop:18}}>
            <h2 className="proto-panel-title">Atalhos no caixa</h2>
            <div style={{display:'flex', flexDirection:'column', gap:6, fontSize:12}}>
              {window.ATALHOS_F.slice(0,6).map((a) => (
                <div key={a.tecla} style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px dashed var(--border-1)'}}>
                  <span style={{fontFamily:'var(--font-numeric)', color:'var(--accent)', fontWeight:600}}>{a.tecla}</span>
                  <span style={{color:'var(--fg-2)'}}>{a.acao}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Fechamento de caixa
// ————————————————————————————————————————————————————
function ScreenFechamento({ go, openModal }) {
  const r = window.FECHAMENTO_RESUMO;
  const [contado, setContado] = React.useState({
    Dinheiro: '', PIX: r.metodos[1].esperado.toFixed(2).replace('.', ','), Cartão: r.metodos[2].esperado.toFixed(2).replace('.', ','),
  });

  const totalSangria = r.sangrias.reduce((s,x)=>s+x.valor,0);
  const totalSupri = r.suprimentos.reduce((s,x)=>s+x.valor,0);
  const totalEsperado = r.metodos.reduce((s,m)=>s+m.esperado, 0);
  const totalContado = Object.values(contado).reduce((s,v)=>s + (parseFloat(String(v).replace(',', '.'))||0), 0);
  const diferenca = totalContado - totalEsperado;

  return (
    <div className="proto-page" data-screen-label="fechamento-caixa">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Fim do turno · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>结班</span></p>
          <h1 className="proto-page-title">Fechamento de caixa</h1>
          <p className="proto-page-sub">Caixa <b>{r.caixa}</b> · {r.operador} · aberto às {window.fmtTime(r.abertura)}.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral" onClick={() => openModal('sangria')}>Sangria / Suprimento</button>
          <button className="app-btn app-btn-accent" onClick={() => openModal('aprovacao')}>Finalizar conferência</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0, 1.4fr) minmax(0, 1fr)', gap:24}}>
        {/* Coluna 1 — conferência */}
        <div>
          <div className="proto-panel" style={{marginBottom:18}}>
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14}}>
              <div>
                <h2 className="proto-panel-title">Conferência por método</h2>
                <p className="proto-panel-sub">Informe o valor <b style={{color:'var(--fg-2)'}}>contado fisicamente</b>; o esperado vem das vendas finalizadas.</p>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Esperado total</div>
                <div className="num" style={{fontSize:22, fontWeight:700, color:'var(--fg-1)'}}>{window.fmtBRL(totalEsperado)}</div>
              </div>
            </div>

            <table className="proto-table" style={{marginBottom:14}}>
              <thead>
                <tr>
                  <th>Método</th>
                  <th style={{textAlign:'right'}}>Esperado</th>
                  <th style={{textAlign:'right'}}>Contado</th>
                  <th style={{textAlign:'right'}}>Diferença</th>
                </tr>
              </thead>
              <tbody>
                {r.metodos.map((m) => {
                  const c = parseFloat(String(contado[m.tipo]).replace(',', '.')) || 0;
                  const dif = c - m.esperado;
                  const cls = dif === 0 ? 'ok' : dif > 0 ? 'warn' : 'err';
                  return (
                    <tr key={m.tipo} style={{cursor:'default'}}>
                      <td><b>{m.tipo}</b></td>
                      <td className="num" style={{textAlign:'right'}}>{window.fmtBRL(m.esperado)}</td>
                      <td style={{textAlign:'right'}}>
                        <input value={contado[m.tipo]} onChange={(e)=>setContado({...contado, [m.tipo]: e.target.value})}
                          placeholder="0,00"
                          style={{width:120, height:34, textAlign:'right',
                            background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)',
                            borderRadius:6, color:'var(--fg-1)', padding:'0 10px',
                            fontFamily:'var(--font-numeric)', fontVariantNumeric:'tabular-nums', fontSize:14,
                          }} />
                      </td>
                      <td className="num" style={{textAlign:'right'}}>
                        {contado[m.tipo] === '' ? <span className="proto-pill muted">—</span> :
                          <span className={'proto-pill ' + cls}>{dif >= 0 ? '+' : ''}{window.fmtBRL(dif)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'14px 16px', borderRadius:10,
              border:'1px solid ' + (Math.abs(diferenca) < 0.01 ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.42)'),
              background: Math.abs(diferenca) < 0.01 ? 'rgba(6,78,59,0.32)' : 'rgba(127,29,29,0.22)',
            }}>
              <div>
                <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Diferença total</div>
                <div className="num" style={{fontSize:24, fontWeight:700, marginTop:2,
                  color: Math.abs(diferenca) < 0.01 ? '#6ee7b7' : '#fca5a5'}}>
                  {diferenca >= 0 ? '+' : ''}{window.fmtBRL(diferenca)}
                </div>
              </div>
              <div style={{fontSize:12, color:'var(--fg-2)', maxWidth:260, lineHeight:1.5, textAlign:'right'}}>
                {Math.abs(diferenca) < 0.01
                  ? 'Conferência baterá no log fiscal. Você está livre para finalizar.'
                  : 'Diferença ≠ R$ 0,00 exige aprovação do gerente.'}
              </div>
            </div>
          </div>

          <div className="proto-panel">
            <h2 className="proto-panel-title">Movimentações do turno</h2>
            <p className="proto-panel-sub">Sangrias e suprimentos registrados durante o dia.</p>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
              <div>
                <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:8}}>Sangrias <span style={{color:'var(--accent)', marginLeft:6}}>− {window.fmtBRL(totalSangria)}</span></div>
                {r.sangrias.map((s, i) => (
                  <div key={i} style={{padding:'8px 0', borderBottom:'1px dashed var(--border-1)', display:'flex', justifyContent:'space-between', gap:10}}>
                    <div>
                      <div style={{fontSize:13}}>{s.motivo}</div>
                      <div style={{fontSize:11, color:'var(--fg-3)', fontFamily:'var(--font-numeric)'}}>{window.fmtTime(s.hora)}</div>
                    </div>
                    <div className="num" style={{color:'#fca5a5', fontWeight:600}}>−{window.fmtBRL(s.valor)}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:8}}>Suprimentos <span style={{color:'#34d399', marginLeft:6}}>+ {window.fmtBRL(totalSupri)}</span></div>
                {r.suprimentos.map((s, i) => (
                  <div key={i} style={{padding:'8px 0', borderBottom:'1px dashed var(--border-1)', display:'flex', justifyContent:'space-between', gap:10}}>
                    <div>
                      <div style={{fontSize:13}}>{s.motivo}</div>
                      <div style={{fontSize:11, color:'var(--fg-3)', fontFamily:'var(--font-numeric)'}}>{window.fmtTime(s.hora)}</div>
                    </div>
                    <div className="num" style={{color:'#6ee7b7', fontWeight:600}}>+{window.fmtBRL(s.valor)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna 2 — resumo */}
        <div>
          <div className="proto-panel">
            <h2 className="proto-panel-title">Resumo do turno</h2>
            <p className="proto-panel-sub">Aberto há 10 h 42 min · {r.vendas} vendas finalizadas.</p>
            <div style={{display:'grid', gap:12}}>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <span style={{color:'var(--fg-3)'}}>Saldo inicial</span>
                <span className="num">{window.fmtBRL(r.saldoInicial)}</span>
              </div>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <span style={{color:'var(--fg-3)'}}>Vendas brutas</span>
                <span className="num">{window.fmtBRL(r.vendasTotal)}</span>
              </div>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <span style={{color:'var(--fg-3)'}}>Sangrias</span>
                <span className="num">−{window.fmtBRL(totalSangria)}</span>
              </div>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <span style={{color:'var(--fg-3)'}}>Suprimentos</span>
                <span className="num">+{window.fmtBRL(totalSupri)}</span>
              </div>
              <hr className="app-divider" />
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                <span style={{fontWeight:600}}>Saldo final esperado</span>
                <span className="num" style={{fontSize:26, fontWeight:800, color:'var(--accent)'}}>
                  {window.fmtBRL(r.saldoInicial + r.metodos[0].esperado - totalSangria + totalSupri)}
                </span>
              </div>
            </div>
          </div>

          <div className="proto-panel" style={{marginTop:18}}>
            <h2 className="proto-panel-title">Próximos passos</h2>
            <ol style={{margin:0, paddingLeft:18, color:'var(--fg-2)', fontSize:13, lineHeight:1.7}}>
              <li>Conte cédulas e moedas separadamente.</li>
              <li>Confira PIX/Cartão pelo extrato da maquininha.</li>
              <li>Diferenças requerem <b style={{color:'var(--accent)'}}>aprovação do gerente</b> (印).</li>
              <li>Sangria de R$ 320,50 para o cofre é gerada automaticamente.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

window.ScreenCaixa = ScreenCaixa;
window.ScreenAbertura = ScreenAbertura;
window.ScreenFechamento = ScreenFechamento;
