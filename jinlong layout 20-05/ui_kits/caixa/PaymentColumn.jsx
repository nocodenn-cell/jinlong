// PaymentColumn.jsx — summary + 3 F-key payment buttons.
function PaymentColumn({ items, total, caixaAberto, method, onMethod, onFinalize }) {
  const qtyTotal = items.reduce((s, i) => s + i.qty, 0);
  const enabled = caixaAberto && items.length > 0;

  React.useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'F8')  { e.preventDefault(); onMethod('PIX'); }
      if (e.key === 'F9')  { e.preventDefault(); onMethod('CARTÃO'); }
      if (e.key === 'F10') { e.preventDefault(); onMethod('DINHEIRO'); }
      if (e.key === 'F4' && enabled) { e.preventDefault(); onFinalize && onFinalize(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onMethod, onFinalize]);

  return (
    <aside aria-label="Pagamento e total">
      {!caixaAberto && (
        <div className="caixa-closed-banner">
          <span aria-hidden style={{fontSize: 18}}>🔒</span>
          <div>
            <b>Caixa fechado</b>
            Abra o caixa para começar a vender — botão "Abrir caixa" no topo.
          </div>
        </div>
      )}

      <div className="caixa-summary">
        <div className="caixa-method-pill">
          <span className="ico" aria-hidden>{method === 'PIX' ? '⌐□' : method === 'CARTÃO' ? '▭' : '●'}</span>
          <span><b style={{textTransform:'capitalize'}}>{method.toLowerCase()}</b> · selecionado</span>
        </div>
        <div className="caixa-total-row">
          <span className="caixa-total-label">Total</span>
          <span className="caixa-total-val">{window.fmtBRL(total)}</span>
        </div>
        <div className="caixa-totals-aux">
          <span>{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
          <span>{qtyTotal} {qtyTotal === 1 ? 'unidade' : 'unidades'}</span>
        </div>
      </div>

      <div className="pay-stack">
        <button
          className={`pay-btn pay-btn-accent ${method === 'PIX' ? 'active' : ''}`}
          disabled={!enabled}
          onClick={() => onMethod('PIX')}>
          <span className="glyph" aria-hidden>⌐□</span>
          <span>PIX</span>
          <span className="key">(F8)</span>
        </button>
        <button
          className={`pay-btn pay-btn-neutral ${method === 'CARTÃO' ? 'active' : ''}`}
          disabled={!enabled}
          onClick={() => onMethod('CARTÃO')}>
          <span className="glyph" aria-hidden>▭</span>
          <span>CARTÃO</span>
          <span className="key">(F9)</span>
        </button>
        <button
          className={`pay-btn pay-btn-subtle ${method === 'DINHEIRO' ? 'active' : ''}`}
          disabled={!enabled}
          onClick={() => onMethod('DINHEIRO')}>
          <span className="glyph" aria-hidden>●</span>
          <span>DINHEIRO</span>
          <span className="key">(F10)</span>
        </button>
      </div>
      <button
        className="app-btn app-btn-accent app-btn-lg"
        style={{marginTop: 16, width: '100%'}}
        disabled={!enabled}
        onClick={onFinalize}>
        Finalizar venda  <span style={{opacity: 0.6, fontSize: 11, marginLeft: 6}}>(F4)</span>
      </button>
    </aside>
  );
}

window.PaymentColumn = PaymentColumn;
