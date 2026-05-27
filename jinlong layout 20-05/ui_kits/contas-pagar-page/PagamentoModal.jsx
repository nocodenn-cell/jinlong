// PagamentoModal.jsx — registrar pagamento (total ou parcial) de uma conta a pagar.

function PagamentoModal({ conta, onClose, onConfirmar }) {
  const aberto = conta.valor_total - conta.valor_pago;
  const [valor, setValor] = React.useState(aberto.toFixed(2).replace('.', ','));
  const [forma, setForma] = React.useState('PIX');
  const [dataPag, setDataPag] = React.useState(new Date().toISOString().slice(0,10));
  const [observacao, setObservacao] = React.useState('');
  const [erros, setErros] = React.useState({});
  const [salvando, setSalvando] = React.useState(false);

  const dialogRef = React.useRef(null);
  const valorRef = React.useRef(null);

  React.useEffect(() => {
    const triggerEl = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => valorRef.current?.focus(), 30);
    function onKey(e) {
      if (salvando) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      else if (e.key === 'Tab') {
        const f = dialogRef.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!f || f.length === 0) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    };
  }, [salvando]);

  const valorNum = parseFloat(String(valor).replace(/\./g,'').replace(',', '.')) || 0;
  const novoAberto = Math.max(0, aberto - valorNum);
  const quita = valorNum >= aberto - 0.001;

  function fechar() {
    if ((valor && valor !== '0,00') && !confirm('Descartar o pagamento em digitação?')) return;
    onClose();
  }
  function handleBackdrop(e) { if (e.target === e.currentTarget && !salvando) fechar(); }
  function handleValor(e) {
    let v = e.target.value.replace(/[^\d,]/g, '');
    const parts = v.split(',');
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
    setValor(v);
    if (erros.valor) setErros(x => ({...x, valor:null}));
  }

  function validar() {
    const e = {};
    if (!valorNum || valorNum <= 0) e.valor = 'Informe um valor maior que zero.';
    else if (valorNum > aberto + 0.001) e.valor = `Valor maior que o saldo em aberto (${window.fmtBRL(aberto)}).`;
    if (!dataPag) e.data = 'Informe a data do pagamento.';
    else if (new Date(dataPag).getTime() > Date.now() + 86400000) e.data = 'A data não pode ser futura.';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function submeter(e) {
    e.preventDefault();
    if (!validar()) return;
    setSalvando(true);
    try {
      await new Promise(r => setTimeout(r, 320));
      onConfirmar({
        conta_id: conta.id,
        valor: valorNum,
        forma,
        data: new Date(dataPag).toISOString(),
        observacao: observacao.trim() || null,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="venda-modal-backdrop" onMouseDown={handleBackdrop}>
      <div ref={dialogRef} className="venda-modal" role="dialog" aria-modal="true"
        aria-labelledby="pg-modal-titulo" onMouseDown={(e)=>e.stopPropagation()}
        style={{maxWidth: 560}}>
        <header className="venda-modal-head">
          <div style={{minWidth:0, flex:1}}>
            <p className="venda-modal-eyebrow">Registrar pagamento · 付款登记</p>
            <h2 id="pg-modal-titulo" className="venda-modal-title">{conta.descricao}</h2>
            <p style={{margin:'8px 0 0', fontSize:12, color:'var(--fg-3)'}}>
              {conta.fornecedor_nome} · vencimento {window.fmtDate(conta.vencimento)}
              {conta.nfe_numero && <> · NF-e #{conta.nfe_numero}</>}
            </p>
          </div>
          <button type="button" onClick={fechar} className="venda-modal-close" aria-label="Fechar" disabled={salvando}>✕</button>
        </header>

        <form onSubmit={submeter}>
          <div className="venda-modal-body">
            {/* Resumo */}
            <div className="pg-resumo">
              <div className="card">
                <div className="lbl">Total</div>
                <div className="val">{window.fmtBRL(conta.valor_total)}</div>
              </div>
              <div className="card">
                <div className="lbl">Já pago</div>
                <div className="val" style={{color: conta.valor_pago > 0 ? '#6ee7b7' : 'var(--fg-3)'}}>
                  {window.fmtBRL(conta.valor_pago)}
                </div>
              </div>
              <div className="card aberto">
                <div className="lbl">Em aberto</div>
                <div className="val">{window.fmtBRL(aberto)}</div>
              </div>
            </div>

            <div className="cli-form">
              {/* Valor */}
              <div className="cli-field">
                <label htmlFor="pg-valor">Valor pago<span className="req">*</span></label>
                <div className="pg-valor-input">
                  <span className="prefix">R$</span>
                  <input ref={valorRef} id="pg-valor" type="text" inputMode="decimal"
                    value={valor} onChange={handleValor}
                    aria-invalid={!!erros.valor}
                    aria-describedby={erros.valor ? 'err-valor' : 'hint-valor'} />
                </div>
                <div className="pg-valor-chips" role="group" aria-label="Valores sugeridos">
                  <button type="button" className="pg-valor-chip" onClick={() => setValor(aberto.toFixed(2).replace('.', ','))}>
                    Pagar tudo · {window.fmtBRL(aberto)}
                  </button>
                  <button type="button" className="pg-valor-chip" onClick={() => setValor((aberto / 2).toFixed(2).replace('.', ','))}>
                    Metade
                  </button>
                  {[100, 500, 1000].map((v) => v < aberto && (
                    <button key={v} type="button" className="pg-valor-chip" onClick={() => setValor(v.toFixed(2).replace('.', ','))}>
                      {window.fmtBRL(v)}
                    </button>
                  ))}
                </div>
                {erros.valor
                  ? <span id="err-valor" className="err" style={{marginTop:8}}>{erros.valor}</span>
                  : <span id="hint-valor" className="hint" style={{marginTop:8}}>
                      {quita
                        ? <b style={{color:'#6ee7b7'}}>✓ Esta conta será quitada.</b>
                        : valorNum > 0
                          ? <>Restará <b style={{color:'var(--accent)'}}>{window.fmtBRL(novoAberto)}</b> em aberto.</>
                          : 'Pode ser pagamento total ou parcial.'}
                    </span>}
              </div>

              {/* Forma */}
              <div className="cli-field">
                <label>Forma de pagamento<span className="req">*</span></label>
                <div className="pg-formas" role="radiogroup" aria-label="Forma de pagamento">
                  {window.FORMAS.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={forma === f.id}
                      className={'pg-forma-btn' + (forma === f.id ? ' active' : '')}
                      onClick={() => setForma(f.id)}>
                      <span className="glyph">{f.glyph}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data + observação */}
              <div className="row-2">
                <div className="cli-field">
                  <label htmlFor="pg-data">Data do pagamento<span className="req">*</span></label>
                  <input id="pg-data" type="date" value={dataPag}
                    onChange={(e) => { setDataPag(e.target.value); if (erros.data) setErros(x => ({...x, data:null})); }}
                    max={new Date().toISOString().slice(0,10)}
                    className={erros.data ? 'error' : ''} aria-invalid={!!erros.data} />
                  {erros.data && <span className="err">{erros.data}</span>}
                </div>
                <div className="cli-field">
                  <label htmlFor="pg-obs">Observação</label>
                  <input id="pg-obs" type="text" value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex.: comprovante banco · ref 99221"
                    maxLength={200} />
                </div>
              </div>
            </div>
          </div>

          <footer className="venda-modal-foot" style={{justifyContent:'flex-end'}}>
            <button type="button" className="app-btn app-btn-neutral" onClick={fechar} disabled={salvando}>Cancelar</button>
            <button type="submit" className="app-btn app-btn-accent" disabled={salvando || !valorNum}>
              {salvando ? 'Registrando…' : quita ? `Quitar ${window.fmtBRL(valorNum)}` : `Registrar ${window.fmtBRL(valorNum)}`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

window.PagamentoModal = PagamentoModal;
