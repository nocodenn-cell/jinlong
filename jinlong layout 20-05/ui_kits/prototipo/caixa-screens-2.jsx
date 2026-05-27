// caixa-screens-2.jsx — devolução/troca, pagamento expandido, recibo.

// ————————————————————————————————————————————————————
// Devolução / Troca
// ————————————————————————————————————————————————————
function ScreenDevolucao({ openModal }) {
  const [step, setStep] = React.useState(2); // 1=buscar, 2=selecionar itens, 3=motivo
  const venda = window.VENDAS[1]; // venda 1208
  const [seleciondados, setSelecionados] = React.useState({ 'JL-0501': true, 'JL-0142': false });
  const totalDevol = window.VENDA_1208_ITENS
    .filter(it => seleciondados[it.sku])
    .reduce((s, it) => s + it.qty * it.preco, 0);

  return (
    <div className="proto-page" data-screen-label="devolucao">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Operação reversa · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>退换货</span></p>
          <h1 className="proto-page-title">Devolução / Troca</h1>
          <p className="proto-page-sub">Selecione os itens a devolver e o motivo. Aprovação do gerente é obrigatória.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">Cancelar</button>
          <button className="app-btn app-btn-accent" onClick={() => openModal('aprovacao')}>
            Solicitar aprovação <span style={{fontFamily:'var(--font-serif-han)', marginLeft:6, color:'#fee2e2'}}>印</span>
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div style={{display:'flex', gap:12, marginBottom:22, alignItems:'center'}}>
        {['Localizar venda', 'Itens a devolver', 'Motivo + reembolso'].map((label, i) => {
          const n = i+1;
          const active = step === n;
          const done = step > n;
          return (
            <React.Fragment key={n}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <div style={{
                  width:28, height:28, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center',
                  border:'1px solid ' + (active || done ? 'var(--accent)' : 'var(--border-1)'),
                  background: active ? 'color-mix(in srgb, var(--accent) 30%, transparent)' :
                             done ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                  color: active || done ? 'var(--accent)' : 'var(--fg-3)',
                  fontFamily:'var(--font-numeric)', fontWeight:700, fontSize:13,
                }}>{done ? '✓' : n}</div>
                <span style={{fontSize:13, color: active ? 'var(--fg-1)' : 'var(--fg-3)', fontWeight: active ? 600 : 400}}>{label}</span>
              </div>
              {n < 3 && <div style={{flex:1, height:1, background:'var(--border-1)'}} />}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0,1.5fr) minmax(0,1fr)', gap:22}}>
        <div>
          <div className="proto-panel" style={{marginBottom:18}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:14}}>
              <div>
                <h2 className="proto-panel-title">Venda #{venda.id}</h2>
                <p className="proto-panel-sub">{window.fmtDateTime(venda.data)} · {venda.operador} · caixa {venda.caixa} · pago em {venda.metodo}</p>
              </div>
              <span className="proto-pill ok">{window.fmtBRL(venda.total)} · {venda.metodo}</span>
            </div>

            <table className="proto-table">
              <thead>
                <tr>
                  <th style={{width:40}}></th>
                  <th>Produto</th>
                  <th style={{textAlign:'right'}}>Qtd</th>
                  <th style={{textAlign:'right'}}>Unit.</th>
                  <th style={{textAlign:'right'}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {window.VENDA_1208_ITENS.map((it) => (
                  <tr key={it.sku}
                    onClick={() => setSelecionados({...seleciondados, [it.sku]: !seleciondados[it.sku]})}
                    className={seleciondados[it.sku] ? 'selected' : ''}>
                    <td>
                      <span style={{
                        width:18, height:18, borderRadius:4, display:'inline-flex', alignItems:'center', justifyContent:'center',
                        border:'1px solid ' + (seleciondados[it.sku] ? 'var(--accent)' : 'var(--border-1)'),
                        background: seleciondados[it.sku] ? 'var(--accent)' : 'transparent',
                        color:'#111827', fontSize:12, fontWeight:700,
                      }}>{seleciondados[it.sku] ? '✓' : ''}</span>
                    </td>
                    <td>
                      <div style={{fontWeight:600}}>{it.nome}</div>
                      <div style={{fontSize:11, color:'var(--fg-3)'}}>{it.sku} · <span style={{letterSpacing:'0.02em'}}>{it.han}</span></div>
                    </td>
                    <td className="num" style={{textAlign:'right'}}>{it.qty}</td>
                    <td className="num" style={{textAlign:'right'}}>{window.fmtBRL(it.preco)}</td>
                    <td className="num" style={{textAlign:'right', fontWeight:600}}>{window.fmtBRL(it.qty * it.preco)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="proto-panel">
            <h2 className="proto-panel-title">Motivo da devolução</h2>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10}}>
              {['Produto com defeito', 'Cliente desistiu', 'Erro do operador', 'Item trocado por outro', 'Avaria no transporte', 'Outro'].map((m) => (
                <button key={m} className="app-chip" style={{justifyContent:'flex-start', padding:'10px 14px'}}>
                  <span style={{
                    width:14, height:14, borderRadius:'50%', border:'1px solid var(--border-1)',
                    display:'inline-block', flexShrink:0,
                  }} />
                  {m}
                </button>
              ))}
            </div>

            <div className="proto-field" style={{marginTop:18}}>
              <label>Observação</label>
              <textarea placeholder="Ex.: cliente acabou de levar a peça em casa e descobriu trinca interna…" />
            </div>
          </div>
        </div>

        <div>
          <div className="proto-panel">
            <h2 className="proto-panel-title">Reembolso</h2>
            <p className="proto-panel-sub">Forma original: <b style={{color:'var(--fg-2)'}}>PIX</b>.</p>

            <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:18}}>
              {[
                { id:'pix',   label:'Estornar PIX',          desc:'Devolve para a mesma chave em até 1 h' },
                { id:'cash',  label:'Devolver em dinheiro',  desc:'Sangria automática · gera comprovante' },
                { id:'cred',  label:'Crédito na conta',      desc:'Vincula ao cliente; abate na próxima compra' },
              ].map((opt, i) => (
                <div key={opt.id} style={{
                  display:'flex', alignItems:'flex-start', gap:12,
                  padding:'12px 14px', borderRadius:10,
                  border:'1px solid ' + (i === 0 ? 'var(--accent)' : 'var(--border-1)'),
                  background: i === 0 ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'rgba(15,23,42,0.45)',
                  cursor:'pointer',
                }}>
                  <span style={{
                    width:18, height:18, borderRadius:'50%', flexShrink:0, marginTop:2,
                    border:'2px solid ' + (i === 0 ? 'var(--accent)' : 'var(--border-1)'),
                    background: i === 0 ? 'radial-gradient(circle, var(--accent) 40%, transparent 45%)' : 'transparent',
                  }} />
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600, fontSize:13, color:'var(--fg-1)'}}>{opt.label}</div>
                    <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>{opt.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <hr className="app-divider" style={{margin:'8px 0 18px'}} />

            <div style={{display:'grid', gap:8, fontSize:13}}>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <span style={{color:'var(--fg-3)'}}>Itens selecionados</span>
                <span className="num">{Object.values(seleciondados).filter(Boolean).length}</span>
              </div>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <span style={{color:'var(--fg-3)'}}>Valor a devolver</span>
                <span className="num" style={{fontWeight:700}}>{window.fmtBRL(totalDevol)}</span>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:8}}>
                <span style={{fontWeight:600}}>Reembolso</span>
                <span className="num" style={{fontSize:26, fontWeight:800, color:'var(--accent)'}}>−{window.fmtBRL(totalDevol)}</span>
              </div>
            </div>
          </div>

          <div style={{
            marginTop:18, padding:'14px 16px', borderRadius:10,
            border:'1px solid color-mix(in srgb, var(--danger) 35%, var(--border-1))',
            background:'rgba(127,29,29,0.18)', color:'#fecaca',
            display:'flex', gap:12, fontSize:12, lineHeight:1.5,
          }}>
            <span style={{fontFamily:'var(--font-serif-han)', fontSize:24, color:'#fca5a5'}}>印</span>
            <span>Devolução exige autenticação do gerente (PIN ou biometria). Será emitido NF-e de devolução automaticamente.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Pagamento expandido (PIX QR / Cartão TEF / Dinheiro com troco)
// ————————————————————————————————————————————————————
function ScreenPagamento({ openModal }) {
  const [metodo, setMetodo] = React.useState('pix');
  const total = 218.50;

  return (
    <div className="proto-page" data-screen-label="pagamento">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Finalização · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>付款</span></p>
          <h1 className="proto-page-title">Pagamento <span className="han">付款</span></h1>
          <p className="proto-page-sub">Venda #1209 · 3 itens · {window.fmtBRL(total)}</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">Voltar ao carrinho</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="proto-tabs">
        <button className={'proto-tab' + (metodo === 'pix' ? ' active' : '')} onClick={()=>setMetodo('pix')}>PIX <span style={{opacity:.6, marginLeft:6}}>F8</span></button>
        <button className={'proto-tab' + (metodo === 'cartao' ? ' active' : '')} onClick={()=>setMetodo('cartao')}>Cartão / TEF <span style={{opacity:.6, marginLeft:6}}>F9</span></button>
        <button className={'proto-tab' + (metodo === 'dinheiro' ? ' active' : '')} onClick={()=>setMetodo('dinheiro')}>Dinheiro <span style={{opacity:.6, marginLeft:6}}>F10</span></button>
        <button className="proto-tab">Múltiplas formas</button>
        <button className="proto-tab">Crediário</button>
      </div>

      {metodo === 'pix' && <PagamentoPix total={total} />}
      {metodo === 'cartao' && <PagamentoCartao total={total} />}
      {metodo === 'dinheiro' && <PagamentoDinheiro total={total} />}
    </div>
  );
}

function PagamentoPix({ total }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:24}}>
      <div className="proto-panel" style={{textAlign:'center', paddingTop:32, paddingBottom:32}}>
        <p className="proto-eyebrow" style={{marginBottom:18}}>Aponte o celular · 用手机扫描</p>
        <div className="pix-qr">
          <div className="pix-qr-inner"></div>
          <img className="pix-qr-logo" src="../../assets/brand-double-dragon.png" alt="" />
        </div>
        <div style={{marginTop:20, fontSize:13, color:'var(--fg-3)'}}>Chave: <b style={{color:'var(--fg-1)', fontFamily:'var(--font-numeric)'}}>12.448.901/0001-22</b></div>
        <div style={{marginTop:6, fontSize:11, color:'var(--fg-3)'}}>Expira em <b style={{color:'var(--accent)', fontFamily:'var(--font-numeric)'}}>04:58</b></div>
      </div>

      <div>
        <div className="proto-panel" style={{marginBottom:18}}>
          <h2 className="proto-panel-title">Aguardando pagamento</h2>
          <p className="proto-panel-sub">O caixa atualiza automaticamente quando o PIX cair.</p>

          <div style={{display:'flex', alignItems:'center', justifyContent:'center', padding:'28px 0'}}>
            <div className="dragon-orbit-wrap" style={{animationDuration:'2.5s'}}>
              <img src="../../assets/dragon-ouroboros-amber.png" alt="" style={{width:90, height:90}} />
            </div>
          </div>

          <div style={{
            textAlign:'center', fontSize:30, fontWeight:800, color:'var(--accent)',
            fontFamily:'var(--font-numeric)', fontVariantNumeric:'tabular-nums', letterSpacing:'-0.01em',
          }}>{window.fmtBRL(total)}</div>
          <div style={{textAlign:'center', fontSize:11, color:'var(--fg-3)', marginTop:4}}>via PIX QR Code dinâmico</div>
        </div>

        <div className="proto-panel">
          <h2 className="proto-panel-title">Mensagem para o cliente</h2>
          <div style={{
            padding:'14px', borderRadius:10,
            background:'rgba(2,6,23,0.55)', border:'1px solid var(--border-1)',
            fontSize:13, color:'var(--fg-2)', lineHeight:1.5,
          }}>
            <b style={{color:'var(--fg-1)'}}>"Pagamento confirmado · 您的付款已到账"</b><br/>
            Será exibido em tela cheia e impresso no cupom.
          </div>

          <div style={{display:'flex', gap:10, marginTop:18}}>
            <button className="app-btn app-btn-neutral" style={{flex:1}}>Cancelar · Esc</button>
            <button className="app-btn app-btn-accent" style={{flex:1}}>Confirmar manualmente</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PagamentoCartao({ total }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:24}}>
      <div className="proto-panel">
        <h2 className="proto-panel-title">Forma · Cartão</h2>
        <div className="proto-tabs" style={{marginTop:14, marginBottom:18}}>
          <button className="proto-tab active">Crédito</button>
          <button className="proto-tab">Débito</button>
          <button className="proto-tab">Voucher</button>
        </div>

        <div className="proto-field" style={{marginBottom:14}}>
          <label>Parcelas</label>
          <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8}}>
            {[1,2,3,4,6,10].map((p, i) => (
              <button key={p} className={'money-chip' + (i === 0 ? ' active' : '')} style={{justifyContent:'center'}}>
                {p}x
              </button>
            ))}
          </div>
          <div style={{fontSize:11, color:'var(--fg-3)', marginTop:8}}>
            Em 3 x · <b style={{color:'var(--fg-2)', fontFamily:'var(--font-numeric)'}}>{window.fmtBRL(total/3)}</b> · sem juros até 4x.
          </div>
        </div>

        <div className="proto-field-row">
          <div className="proto-field">
            <label>Bandeira</label>
            <select>
              <option>Detectar automaticamente</option>
              <option>Visa</option><option>Mastercard</option><option>Elo</option><option>Hipercard</option>
            </select>
          </div>
          <div className="proto-field">
            <label>Adquirente</label>
            <select><option>Stone · maquininha 0142</option><option>Cielo · TEF</option></select>
          </div>
        </div>
      </div>

      <div className="proto-panel" style={{textAlign:'center', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', minHeight:380}}>
        <div style={{
          width:180, height:240, borderRadius:18, position:'relative',
          background:'linear-gradient(180deg, #1e293b, #0b1220)',
          border:'1px solid var(--border-strong)',
          boxShadow:'0 18px 48px -16px rgba(0,0,0,0.6)',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end',
          padding:'18px 12px',
        }}>
          <div style={{
            position:'absolute', top:14, left:14, right:14, height:24,
            background:'#0b1220', borderRadius:4, color:'var(--accent)',
            fontFamily:'var(--font-numeric)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>JINLONG IMPORTADOS</div>
          <div style={{
            position:'absolute', top:54, left:14, right:14, height:64,
            background:'rgba(251,191,36,0.10)', borderRadius:4, color:'var(--accent)',
            fontFamily:'var(--font-numeric)', fontSize:26, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>{window.fmtBRL(total)}</div>
          <div style={{
            display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, width:'100%', marginBottom:8,
          }}>
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map((k) => (
              <div key={k} style={{
                height:22, borderRadius:4, background:'rgba(148,163,184,0.10)',
                fontSize:11, color:'var(--fg-2)', display:'inline-flex', alignItems:'center', justifyContent:'center',
                fontFamily:'var(--font-numeric)',
              }}>{k}</div>
            ))}
          </div>
          <div style={{fontSize:9, color:'var(--fg-3)', letterSpacing:'0.16em', textTransform:'uppercase'}}>Insira o cartão</div>
        </div>
        <p style={{marginTop:18, fontSize:13, color:'var(--fg-2)'}}>Aguardando inserção do cartão na maquininha…</p>
        <p style={{marginTop:4, fontSize:11, color:'var(--fg-3)'}}>TEF Stone conectada · pingo 142 ms</p>

        <div style={{display:'flex', gap:10, marginTop:24}}>
          <button className="app-btn app-btn-neutral">Cancelar TEF</button>
          <button className="app-btn app-btn-accent">Confirmar venda</button>
        </div>
      </div>
    </div>
  );
}

function PagamentoDinheiro({ total }) {
  const [recebido, setRecebido] = React.useState('250,00');
  const recebidoNum = parseFloat(recebido.replace(',', '.')) || 0;
  const troco = Math.max(0, recebidoNum - total);

  const sugestoes = [50, 100, 200, 250, 500];

  return (
    <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:24}}>
      <div className="proto-panel">
        <h2 className="proto-panel-title">Quanto o cliente entregou?</h2>

        <div style={{
          display:'flex', alignItems:'center', justifyContent:'flex-end',
          padding:'20px 24px', borderRadius:14,
          background:'rgba(2,6,23,0.55)', border:'2px solid var(--accent)',
          marginTop:14, marginBottom:14,
        }}>
          <span style={{color:'var(--fg-3)', fontSize:18, marginRight:10}}>R$</span>
          <input value={recebido} onChange={(e)=>setRecebido(e.target.value)}
            style={{
              background:'transparent', border:'none', outline:'none',
              fontFamily:'var(--font-numeric)', fontSize:48, fontWeight:800, fontVariantNumeric:'tabular-nums',
              color:'var(--accent)', textAlign:'right', width:'100%', letterSpacing:'-0.01em',
            }} />
        </div>

        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:14}}>
          {sugestoes.map((s) => (
            <button key={s} className={'money-chip' + (recebidoNum === s ? ' active' : '')}
              onClick={() => setRecebido(s.toFixed(2).replace('.', ','))}>
              R$ {s}
            </button>
          ))}
          <button className="money-chip" onClick={() => setRecebido(total.toFixed(2).replace('.', ','))}>Exato</button>
        </div>

        <div className="numpad">
          {['1','2','3','4','5','6','7','8','9'].map((k) => (
            <button key={k} onClick={() => setRecebido((v) => (v === '0,00' ? k : v + k))}>{k}</button>
          ))}
          <button className="action" onClick={() => setRecebido('0,00')}>C</button>
          <button onClick={() => setRecebido((v) => (v === '0,00' ? '0' : v + '0'))}>0</button>
          <button className="action ok">OK</button>
        </div>
      </div>

      <div>
        <div className="proto-panel" style={{marginBottom:18}}>
          <p className="proto-eyebrow">Troco · 找零</p>
          <div style={{textAlign:'center', padding:'22px 0'}}>
            <div style={{fontSize:14, color:'var(--fg-3)', marginBottom:6}}>O cliente leva</div>
            <div className="num" style={{fontSize:64, fontWeight:900, lineHeight:1, color:'var(--accent)', letterSpacing:'-0.02em'}}>
              {window.fmtBRL(troco)}
            </div>
            <div style={{fontSize:12, color:'var(--fg-3)', marginTop:10}}>
              {troco === 0 ? 'Valor exato.' : `${recebidoNum.toFixed(2)} − ${total.toFixed(2)} = ${troco.toFixed(2)}`}
            </div>
          </div>

          <hr className="app-divider" />

          <div style={{display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--fg-3)', marginTop:14}}>
            <span>Total da venda</span>
            <span className="num">{window.fmtBRL(total)}</span>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--fg-3)'}}>
            <span>Recebido em dinheiro</span>
            <span className="num">{window.fmtBRL(recebidoNum)}</span>
          </div>
        </div>

        <div className="proto-panel">
          <h2 className="proto-panel-title">Sugestão de troco</h2>
          <p className="proto-panel-sub">A gaveta tem 4 × R$ 5, 3 × R$ 10 e 12 moedas.</p>
          <div style={{display:'grid', gap:8, fontFamily:'var(--font-numeric)', fontSize:13, color:'var(--fg-2)'}}>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>1 × R$ 20,00</span><span className="num">R$ 20,00</span></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>1 × R$ 10,00</span><span className="num">R$ 10,00</span></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>3 × R$ 0,50</span><span className="num">R$ 1,50</span></div>
          </div>
          <button className="app-btn app-btn-accent app-btn-lg" style={{width:'100%', marginTop:16}}>
            Confirmar e imprimir recibo
          </button>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Recibo / Cupom
// ————————————————————————————————————————————————————
function ScreenRecibo() {
  const venda = window.VENDAS[0];
  return (
    <div className="proto-page" data-screen-label="recibo">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Comprovante · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>票据</span></p>
          <h1 className="proto-page-title">Recibo / Cupom</h1>
          <p className="proto-page-sub">Pré-visualização do cupom não fiscal (rolo 80 mm). Para SAT/NFC-e use o relatório fiscal.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">↺ Reimprimir</button>
          <button className="app-btn app-btn-neutral">📧 Enviar por e-mail</button>
          <button className="app-btn app-btn-accent">Imprimir agora</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0, 1fr) minmax(0, 1fr)', gap:32, alignItems:'flex-start'}}>
        {/* Cupom */}
        <div style={{padding:'18px 0'}}>
          <div className="cupom">
            <div className="cupom-watermark"></div>
            <div style={{position:'relative', textAlign:'center', marginBottom:8}}>
              <div className="cupom-han" style={{fontSize:22, fontWeight:700, letterSpacing:'0.12em'}}>金龍</div>
              <div style={{fontFamily:'Cinzel, serif', fontSize:11, letterSpacing:'0.24em', fontWeight:600, marginTop:2}}>JĪN LÓNG</div>
              <div style={{fontSize:10, marginTop:6, opacity:0.8}}>R. Padre João Manuel, 998 · Cerqueira César, SP</div>
              <div style={{fontSize:10, opacity:0.8}}>CNPJ: 12.448.901/0001-22 · IE: 195.448.221.110</div>
            </div>
            <div className="cupom-divider"></div>
            <div className="cupom-row"><span>Venda</span><span>#{venda.id}</span></div>
            <div className="cupom-row"><span>Caixa / Op.</span><span>{venda.caixa} · {venda.operador}</span></div>
            <div className="cupom-row"><span>Data</span><span>{window.fmtDateTime(venda.data)}</span></div>
            <div className="cupom-divider"></div>

            <div style={{position:'relative', display:'flex', flexDirection:'column', gap:8}}>
              {window.VENDA_1208_ITENS.map((it) => (
                <div key={it.sku}>
                  <div style={{fontWeight:700, fontSize:11.5}}>{it.nome}</div>
                  <div style={{fontSize:10, opacity:0.7}}>{it.sku} · <span className="cupom-han">{it.han}</span></div>
                  <div className="cupom-row" style={{marginTop:2}}>
                    <span>{it.qty} × R$ {it.preco.toFixed(2).replace('.', ',')}</span>
                    <span style={{fontWeight:700}}>R$ {(it.qty*it.preco).toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="cupom-divider solid" style={{marginTop:12}}></div>
            <div className="cupom-row" style={{fontWeight:700, fontSize:13.5}}>
              <span>TOTAL</span>
              <span>R$ {venda.total.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="cupom-row" style={{marginTop:6, fontSize:10.5}}>
              <span>Pago em {venda.metodo}</span>
              <span>R$ {venda.total.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="cupom-row" style={{fontSize:10.5}}>
              <span>Troco</span>
              <span>R$ 0,00</span>
            </div>
            <div className="cupom-divider"></div>
            <div style={{position:'relative', textAlign:'center', fontSize:10, lineHeight:1.45, marginTop:10, marginBottom:30}}>
              <div className="cupom-han" style={{fontWeight:700, fontSize:12, marginBottom:4}}>谢谢光临 · Obrigado!</div>
              <div style={{opacity:0.7}}>Trocas em até 7 dias, com cupom.<br/>www.jinlong.com.br</div>
            </div>
            <div className="cupom-seal">印</div>
          </div>
          <div style={{textAlign:'center', fontSize:11, color:'var(--fg-3)', marginTop:14}}>
            Cupom não fiscal · 80 mm × ajustável · monoespaçado
          </div>
        </div>

        {/* Configurações do cupom */}
        <div>
          <div className="proto-panel" style={{marginBottom:18}}>
            <h2 className="proto-panel-title">Templates disponíveis</h2>
            <p className="proto-panel-sub">O cupom muda conforme o tipo de operação.</p>
            <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:12}}>
              {[
                { id:'venda',   label:'Venda finalizada',     desc:'Padrão · com 印 estamp',     active:true },
                { id:'devol',   label:'Devolução / Troca',    desc:'Inverte sinais · vermelho' },
                { id:'sangria', label:'Sangria do caixa',     desc:'Comprovante interno' },
                { id:'fech',    label:'Fechamento de caixa',  desc:'Conferência completa por método' },
                { id:'nfe',     label:'NFC-e (fiscal)',       desc:'Espelho com QR SEFAZ · pendente impressão A4' },
              ].map((t) => (
                <div key={t.id} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:8,
                  border:'1px solid ' + (t.active ? 'var(--accent)' : 'var(--border-1)'),
                  background: t.active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'rgba(15,23,42,0.45)',
                  cursor:'pointer',
                }}>
                  <span style={{
                    width:8, height:8, borderRadius:'50%', flexShrink:0,
                    background: t.active ? 'var(--accent)' : 'var(--border-1)',
                  }} />
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600, fontSize:13}}>{t.label}</div>
                    <div style={{fontSize:11, color:'var(--fg-3)'}}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="proto-panel">
            <h2 className="proto-panel-title">Opções de impressão</h2>
            <div style={{display:'grid', gap:10, marginTop:14}}>
              {[
                ['Selo 印 (carimbo imperial)', true],
                ['Marca d\'água (dragão duplo)', true],
                ['QR Code de avaliação',         false],
                ['Mensagem bilíngue PT + 中文',  true],
                ['Política de troca rodapé',     true],
              ].map(([label, on], i) => (
                <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px dashed var(--border-1)'}}>
                  <span style={{fontSize:13, color:'var(--fg-2)'}}>{label}</span>
                  <span style={{
                    display:'inline-flex', alignItems:'center',
                    width:36, height:20, borderRadius:999,
                    background: on ? 'var(--accent)' : 'rgba(148,163,184,0.3)',
                    padding:2, transition:'all 150ms',
                  }}>
                    <span style={{
                      width:16, height:16, borderRadius:'50%', background:'#fff',
                      marginLeft: on ? 16 : 0, transition:'margin 150ms',
                    }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.ScreenDevolucao = ScreenDevolucao;
window.ScreenPagamento = ScreenPagamento;
window.ScreenRecibo = ScreenRecibo;
