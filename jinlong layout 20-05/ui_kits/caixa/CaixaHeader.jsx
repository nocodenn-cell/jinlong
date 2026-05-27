// CaixaHeader.jsx — top strip: title, operator/caixa chips, live clock, status pill.
function CaixaHeader({ caixaId = '01', operadorNome = 'João Wei', caixaAberto = true }) {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <header className="caixa-header">
      <div className="caixa-header-left">
        <h1 className="caixa-title">Carrinho</h1>
        <span className="caixa-han">购物车</span>
      </div>
      <div className="caixa-meta">
        <span className="caixa-meta-chip">Caixa: <b>{caixaId}</b></span>
        <span className="caixa-meta-chip">Operador: <b style={{color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontWeight: 600}}>{operadorNome}</b></span>
        <span className="caixa-meta-clock">⏱ {time}</span>
        {!caixaAberto && <span className="app-badge app-badge-warn">⚠ Caixa fechado</span>}
      </div>
    </header>
  );
}

window.CaixaHeader = CaixaHeader;
