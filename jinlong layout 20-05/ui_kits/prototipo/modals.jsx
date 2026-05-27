// Modals.jsx — sangria/suprimento, aprovação gerente 印, drawer venda.

// ————————————————————————————————————————————————————
// Sangria / Suprimento (mesma UI, toggle no topo)
// ————————————————————————————————————————————————————
function SangriaModal({ onClose, openModal }) {
  const [tipo, setTipo] = React.useState('sangria');
  const [valor, setValor] = React.useState('200,00');
  const [motivo, setMotivo] = React.useState('Banco — depósito');

  const motivos = tipo === 'sangria'
    ? ['Banco — depósito', 'Troco — caixa 02', 'Pagamento de fornecedor', 'Reposição cofre', 'Outro']
    : ['Troco adicional', 'Reposição de moedas', 'Aporte do gerente', 'Outro'];

  return (
    <div className="proto-modal-backdrop" onClick={onClose}>
      <div className="proto-modal" style={{maxWidth:560}} onClick={(e)=>e.stopPropagation()}>
        <div className="proto-modal-head">
          <div>
            <p className="proto-eyebrow" style={{margin:0, marginBottom:4}}>F5 · Movimentação de caixa</p>
            <h2 className="proto-modal-title">{tipo === 'sangria' ? 'Sangria' : 'Suprimento'} <span style={{fontFamily:'var(--font-serif-han)', color:'var(--accent)', fontSize:14, marginLeft:8, letterSpacing:'0.08em'}}>{tipo === 'sangria' ? '提现' : '补现'}</span></h2>
            <p className="proto-modal-sub">{tipo === 'sangria' ? 'Retira dinheiro da gaveta (vai para o cofre / banco).' : 'Adiciona dinheiro à gaveta (vem do cofre / outro caixa).'}</p>
          </div>
          <button className="proto-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="proto-modal-body">
          {/* Toggle sangria / suprimento */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:0,
            background:'rgba(2,6,23,0.45)', borderRadius:10, padding:4, marginBottom:18,
            border:'1px solid var(--border-1)',
          }}>
            {['sangria', 'suprimento'].map((t) => (
              <button key={t}
                onClick={()=>setTipo(t)}
                style={{
                  height:38, border:'none', borderRadius:6, cursor:'pointer',
                  background: tipo === t
                    ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 86%, #fff 14%), color-mix(in srgb, var(--accent-strong) 90%, #000 10%))'
                    : 'transparent',
                  color: tipo === t ? '#111827' : 'var(--fg-2)',
                  fontWeight: tipo === t ? 700 : 500, fontSize:13,
                  fontFamily:'var(--font-sans)',
                  transition:'all 120ms',
                }}>
                {t === 'sangria' ? '− Sangria (retirada)' : '+ Suprimento (entrada)'}
              </button>
            ))}
          </div>

          <div className="proto-field" style={{marginBottom:18}}>
            <label>Valor</label>
            <div style={{
              display:'flex', alignItems:'center', padding:'14px 18px',
              borderRadius:12, border:'2px solid var(--accent)',
              background:'rgba(2,6,23,0.55)',
            }}>
              <span style={{color:'var(--fg-3)', marginRight:10, fontSize:18}}>R$</span>
              <input value={valor} onChange={(e)=>setValor(e.target.value)}
                style={{
                  flex:1, background:'transparent', border:'none', outline:'none',
                  fontFamily:'var(--font-numeric)', fontSize:36, fontWeight:800,
                  fontVariantNumeric:'tabular-nums', color: tipo === 'sangria' ? '#fca5a5' : '#6ee7b7',
                  textAlign:'right',
                }} />
            </div>
            <div style={{display:'flex', gap:8, marginTop:10, flexWrap:'wrap'}}>
              {[50, 100, 200, 300, 500].map((s) => (
                <button key={s} className="money-chip" onClick={()=>setValor(s.toFixed(2).replace('.', ','))}>
                  R$ {s}
                </button>
              ))}
            </div>
          </div>

          <div className="proto-field" style={{marginBottom:18}}>
            <label>Motivo</label>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              {motivos.map((m) => (
                <button key={m}
                  onClick={()=>setMotivo(m)}
                  className={'money-chip' + (motivo === m ? ' active' : '')}
                  style={{justifyContent:'flex-start', fontFamily:'var(--font-sans)', fontWeight:500}}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="proto-field">
            <label>Observação (opcional)</label>
            <textarea placeholder="Ex.: depósito feito pelo Sr. Wei às 14h." style={{minHeight:60}} />
          </div>

          <div style={{
            marginTop:18, padding:'12px 14px', borderRadius:10,
            border:'1px solid color-mix(in srgb, var(--accent) 35%, var(--border-1))',
            background:'color-mix(in srgb, var(--accent-strong) 10%, transparent)',
            fontSize:12, color:'var(--fg-2)', display:'flex', gap:12,
          }}>
            <span style={{fontFamily:'var(--font-serif-han)', fontSize:22, color:'#fca5a5'}}>印</span>
            <span>Movimentações acima de <b style={{color:'var(--accent)'}}>R$ 100,00</b> requerem aprovação do gerente. O log fiscal é gerado automaticamente.</span>
          </div>
        </div>

        <div className="proto-modal-foot">
          <button className="app-btn app-btn-neutral" onClick={onClose}>Cancelar · Esc</button>
          <button className="app-btn app-btn-accent" onClick={()=>{ onClose(); openModal && openModal('aprovacao'); }}>
            Confirmar {tipo === 'sangria' ? 'sangria' : 'suprimento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Aprovação do gerente (PIN ou biometria)
// ————————————————————————————————————————————————————
function AprovacaoGerenteModal({ onClose, contexto = 'Sangria de R$ 200,00 · motivo: banco' }) {
  const [pin, setPin] = React.useState('');
  const [tab, setTab] = React.useState('pin'); // pin | bio
  const max = 4;

  function tap(d) {
    if (pin.length < max) setPin((p) => p + d);
  }
  function back() { setPin((p) => p.slice(0, -1)); }
  function clear() { setPin(''); }

  return (
    <div className="proto-modal-backdrop" onClick={onClose}>
      <div className="proto-modal" style={{maxWidth:520, overflow:'visible'}} onClick={(e)=>e.stopPropagation()}>
        <div className="proto-modal-head" style={{alignItems:'center'}}>
          <div style={{display:'flex', alignItems:'center', gap:18}}>
            <div className="imperial-seal imperial-seal-pulse">印</div>
            <div>
              <p className="proto-eyebrow" style={{margin:0, marginBottom:4}}>Aprovação requerida</p>
              <h2 className="proto-modal-title">Gerente · <span style={{fontFamily:'var(--font-serif-han)', color:'var(--accent)', fontSize:18, marginLeft:6, letterSpacing:'0.08em'}}>经理审批</span></h2>
              <p className="proto-modal-sub" style={{maxWidth:300}}>{contexto}</p>
            </div>
          </div>
          <button className="proto-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="proto-tabs" style={{padding:'0 24px', margin:'12px 0 8px'}}>
          <button className={'proto-tab' + (tab === 'pin' ? ' active' : '')} onClick={()=>setTab('pin')}>PIN do gerente</button>
          <button className={'proto-tab' + (tab === 'bio' ? ' active' : '')} onClick={()=>setTab('bio')}>Biometria · digital</button>
        </div>

        <div className="proto-modal-body" style={{paddingTop:8}}>
          {tab === 'pin' && (
            <>
              <div style={{textAlign:'center', padding:'18px 0 24px'}}>
                <div style={{fontSize:13, color:'var(--fg-3)', marginBottom:14}}>Digite o PIN de 4 dígitos</div>
                <div className="pin-dots">
                  {[0,1,2,3].map((i) => (
                    <span key={i} className={'pin-dot' + (i < pin.length ? ' filled' : '')} />
                  ))}
                </div>
              </div>

              <div className="numpad" style={{maxWidth:280, margin:'0 auto'}}>
                {['1','2','3','4','5','6','7','8','9'].map((k) => (
                  <button key={k} onClick={()=>tap(k)}>{k}</button>
                ))}
                <button className="action" onClick={clear}>C</button>
                <button onClick={()=>tap('0')}>0</button>
                <button className="action ok" onClick={()=>{
                  if (pin.length === max) onClose();
                  else back();
                }}>{pin.length === max ? '✓' : '⌫'}</button>
              </div>

              <div style={{textAlign:'center', fontSize:11, color:'var(--fg-3)', marginTop:16}}>
                Gerente: <b style={{color:'var(--fg-2)'}}>M. Wei</b> · expira em 30 s
              </div>
            </>
          )}

          {tab === 'bio' && (
            <div style={{textAlign:'center', padding:'40px 0 24px'}}>
              <div style={{
                width:140, height:140, borderRadius:'50%', margin:'0 auto',
                background:'radial-gradient(circle at 30% 30%, rgba(251,191,36,0.18), transparent 60%), rgba(15,23,42,0.6)',
                border:'2px solid var(--accent)',
                display:'flex', alignItems:'center', justifyContent:'center',
                position:'relative',
                animation:'imperial-seal-breathe 1.8s ease-in-out infinite',
              }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" style={{color:'var(--accent)'}}>
                  <path d="M5.7 18.6c1.1-1.5 1.8-3.4 1.8-5.3 0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/>
                  <path d="M8.6 21.5c2-2 3.4-4.4 3.4-7.2"/>
                  <path d="M11.5 21.6c.4-1.4.6-2.8.6-4.3v-.8a3.5 3.5 0 0 0-7 0"/>
                  <path d="M19.5 12c0-4.1-3.4-7.5-7.5-7.5-1.3 0-2.5.3-3.5.9"/>
                  <path d="M3 9c1-.9 2.2-1.5 3.5-1.8"/>
                  <path d="M18.5 18.6c.5-1.1 1-2.5 1-4"/>
                  <path d="M14.4 21.6c.5-1.5.8-3.2 1-4.7"/>
                </svg>
              </div>
              <div style={{fontSize:14, fontWeight:600, marginTop:18, color:'var(--fg-1)'}}>Toque o sensor</div>
              <div style={{fontSize:12, color:'var(--fg-3)', marginTop:4}}>O sensor está conectado ao caixa 01.</div>
            </div>
          )}
        </div>

        <div className="proto-modal-foot">
          <button className="app-btn app-btn-neutral" onClick={onClose}>Cancelar · Esc</button>
          <button className="app-btn app-btn-danger" onClick={onClose}>Negar operação</button>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Drawer — detalhe da venda (usado em Histórico de vendas)
// ————————————————————————————————————————————————————
function VendaDrawer({ venda, onClose, openModal, go }) {
  if (!venda) return null;
  const itens = window.VENDA_1208_ITENS;
  const subtotal = itens.reduce((s, i) => s + i.qty * i.preco, 0);

  return (
    <>
      <div className="proto-drawer-backdrop" onClick={onClose}></div>
      <div className="proto-drawer">
        <div style={{padding:'20px 24px', borderBottom:'1px solid var(--border-1)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14}}>
          <div>
            <p className="proto-eyebrow" style={{margin:0, marginBottom:4}}>Venda #{venda.id} · {window.fmtDateTime(venda.data)}</p>
            <h2 style={{margin:0, fontSize:24, fontWeight:700, color:'var(--accent)', fontFamily:'var(--font-numeric)'}}>{window.fmtBRL(venda.total)}</h2>
            <p style={{margin:'6px 0 0', fontSize:12, color:'var(--fg-3)'}}>
              {venda.itens} itens · pago em <b style={{color:'var(--fg-2)'}}>{venda.metodo}</b> · {venda.operador}, caixa {venda.caixa}
            </p>
          </div>
          <button className="proto-modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{padding:'18px 24px'}}>
          <h3 style={{margin:'0 0 12px', fontSize:13, fontWeight:600, color:'var(--fg-1)'}}>Itens</h3>
          {itens.map((it) => (
            <div key={it.sku} style={{display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, padding:'10px 0', borderBottom:'1px dashed var(--border-1)'}}>
              <div>
                <div style={{fontSize:13, fontWeight:600}}>{it.nome}</div>
                <div style={{fontSize:11, color:'var(--fg-3)'}}>{it.sku} · <span style={{letterSpacing:'0.02em'}}>{it.han}</span></div>
              </div>
              <div className="num" style={{textAlign:'right', color:'var(--fg-3)', fontSize:12}}>{it.qty} × {window.fmtBRL(it.preco)}</div>
              <div className="num" style={{textAlign:'right', fontWeight:700, fontSize:13}}>{window.fmtBRL(it.qty * it.preco)}</div>
            </div>
          ))}

          <div style={{padding:'14px 0', display:'grid', gap:6, fontSize:13}}>
            <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>Subtotal</span><span className="num">{window.fmtBRL(subtotal)}</span></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--fg-3)'}}>Desconto</span><span className="num">R$ 0,00</span></div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
              <span style={{fontWeight:700}}>Total</span>
              <span className="num" style={{fontSize:22, fontWeight:800, color:'var(--accent)'}}>{window.fmtBRL(subtotal)}</span>
            </div>
          </div>

          <div className="proto-tabs" style={{margin:'16px 0'}}>
            <button className="proto-tab active">Resumo</button>
            <button className="proto-tab">Pagamento</button>
            <button className="proto-tab">Fiscal · NFC-e</button>
            <button className="proto-tab">Log</button>
          </div>

          <div style={{display:'grid', gap:14}}>
            <div style={{padding:'12px 14px', borderRadius:10, background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)'}}>
              <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:6}}>Cliente</div>
              <div style={{fontSize:13, color:'var(--fg-1)', fontWeight:600}}>{venda.cliente || 'Sem cadastro'}</div>
              {venda.cliente && <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>Última compra: hoje · 24 compras no histórico</div>}
            </div>

            <div style={{padding:'12px 14px', borderRadius:10, background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)'}}>
              <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:6}}>NFC-e</div>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontSize:13, color:'var(--fg-1)', fontWeight:600}}>nº 35260512448901000122…01209</div>
                <span className="proto-pill ok">autorizada</span>
              </div>
              <div style={{fontSize:11, color:'var(--fg-3)', marginTop:4, fontFamily:'var(--font-numeric)'}}>chave: 3526 0512 4489 0100 0122 5500 0000 1209 1042</div>
            </div>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:22}}>
            <button className="app-btn app-btn-accent" onClick={()=>{ onClose(); go && go('recibo'); }}>Ver cupom completo</button>
            <button className="app-btn app-btn-neutral" onClick={()=>{ onClose(); go && go('devolucao'); }}>Iniciar devolução desta venda</button>
            <button className="app-btn app-btn-danger" onClick={()=>{ onClose(); openModal && openModal('aprovacao'); }}>
              Cancelar venda <span style={{fontFamily:'var(--font-serif-han)', marginLeft:6}}>印</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

window.SangriaModal = SangriaModal;
window.AprovacaoGerenteModal = AprovacaoGerenteModal;
window.VendaDrawer = VendaDrawer;
