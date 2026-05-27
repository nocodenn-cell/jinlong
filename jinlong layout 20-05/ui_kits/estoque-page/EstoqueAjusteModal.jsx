// EstoqueAjusteModal.jsx — modal padrão Jin Lóng (dragon-glass-card) com 3 modos:
// entrada / saída / acerto. Preview ao vivo do estoque resultante.

function EstoqueAjusteModal({ produto, onClose, onSalvar }) {
  const [operacao, setOperacao] = React.useState('entrada'); // entrada | saida | ajuste
  const [quantidade, setQuantidade] = React.useState('');
  const [novoMinimo, setNovoMinimo] = React.useState(String(produto.estoque_minimo));
  const [motivo, setMotivo] = React.useState(() => {
    return window.MOTIVOS.find((m) => m.tipo === 'in')?.value ?? 'ENTRADA_MANUAL';
  });
  const [observacao, setObservacao] = React.useState('');
  const [erros, setErros] = React.useState({});
  const [salvando, setSalvando] = React.useState(false);

  const dialogRef = React.useRef(null);
  const closeBtnRef = React.useRef(null);
  const firstFieldRef = React.useRef(null);

  // ESC + lock scroll + focus trap + foco volta
  React.useEffect(() => {
    const triggerEl = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => firstFieldRef.current?.focus(), 30);

    function onKey(e) {
      if (salvando) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      else if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
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

  // Atualiza motivo padrão ao mudar operação
  React.useEffect(() => {
    const tipoEsperado = operacao === 'entrada' ? 'in' : operacao === 'saida' ? 'out' : 'adj';
    const m = window.MOTIVOS.find((x) => x.tipo === tipoEsperado);
    if (m) setMotivo(m.value);
    setQuantidade('');
    if (operacao !== 'ajuste') setNovoMinimo(String(produto.estoque_minimo));
  }, [operacao, produto.estoque_minimo]);

  const motivosDoTipo = window.MOTIVOS.filter((m) => {
    const tipoEsperado = operacao === 'entrada' ? 'in' : operacao === 'saida' ? 'out' : 'adj';
    return m.tipo === tipoEsperado;
  });

  const qtyNum = parseFloat(String(quantidade).replace(',', '.')) || 0;
  const novoEstoque =
    operacao === 'entrada' ? produto.quantidade_atual + qtyNum :
    operacao === 'saida'   ? produto.quantidade_atual - qtyNum :
                              qtyNum;
  const novoMinNum = parseFloat(String(novoMinimo).replace(',', '.')) || 0;
  const ficaraCritico = novoEstoque <= novoMinNum;

  function sujo() {
    return !!(quantidade || observacao || String(novoMinNum) !== String(produto.estoque_minimo));
  }

  function fechar() {
    if (sujo() && !confirm('Descartar este ajuste?')) return;
    onClose();
  }

  function handleBackdrop(e) {
    if (e.target !== e.currentTarget || salvando) return;
    fechar();
  }

  function validar() {
    const e = {};
    if (!quantidade.trim() || isNaN(qtyNum)) e.quantidade = 'Informe a quantidade.';
    else if (operacao === 'entrada' && qtyNum <= 0) e.quantidade = 'Entrada deve ser positiva.';
    else if (operacao === 'saida' && qtyNum <= 0) e.quantidade = 'Saída deve ser positiva.';
    else if (operacao === 'saida' && qtyNum > produto.quantidade_atual) e.quantidade = `Saída maior que o estoque atual (${produto.quantidade_atual}).`;
    else if (operacao === 'ajuste' && qtyNum < 0) e.quantidade = 'Estoque não pode ser negativo.';
    if (operacao === 'ajuste' && novoMinNum < 0) e.minimo = 'Mínimo não pode ser negativo.';
    if (motivo === 'OUTRO' && observacao.trim().length < 3) e.observacao = 'Para "Outro", a observação é obrigatória (mín. 3 caracteres).';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function submeter(e) {
    e.preventDefault();
    if (!validar()) return;
    setSalvando(true);
    try {
      await new Promise((r) => setTimeout(r, 320)); // simula latência
      onSalvar({
        produto_id: produto.id,
        operacao,
        quantidade: qtyNum,
        quantidade_atual: novoEstoque,
        estoque_minimo: novoMinNum,
        motivo,
        observacao: observacao.trim() || undefined,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="venda-modal-backdrop" onMouseDown={handleBackdrop}>
      <div
        ref={dialogRef}
        className="venda-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="estoque-aj-titulo"
        onMouseDown={(e) => e.stopPropagation()}
        style={{maxWidth: 620}}
      >
        <header className="venda-modal-head">
          <div style={{minWidth:0, flex:1}}>
            <p className="venda-modal-eyebrow">Ajuste de estoque · 库存调整</p>
            <h2 id="estoque-aj-titulo" className="venda-modal-title">
              {produto.nome}
            </h2>
            <p style={{margin:'8px 0 0', fontSize:12, color:'var(--fg-3)'}}>
              {produto.sku} · {produto.codigo_barras} · {produto.categoria_nome}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={fechar}
            className="venda-modal-close"
            aria-label="Fechar"
            disabled={salvando}
          >✕</button>
        </header>

        <form onSubmit={submeter}>
          <div className="venda-modal-body">
            {/* Snapshot atual */}
            <div className="estoque-aj-current">
              <div className={'card' + (produto.quantidade_atual <= produto.estoque_minimo ? ' alert' : '')}>
                <div className="lbl">Estoque atual</div>
                <div className="val">{window.fmtNum(produto.quantidade_atual)} <span style={{fontSize:11, color:'var(--fg-3)', fontWeight:400}}>{produto.unidade_medida}</span></div>
              </div>
              <div className="card">
                <div className="lbl">Mínimo configurado</div>
                <div className="val" style={{color:'var(--fg-2)'}}>{window.fmtNum(produto.estoque_minimo)} <span style={{fontSize:11, color:'var(--fg-3)', fontWeight:400}}>{produto.unidade_medida}</span></div>
              </div>
            </div>

            <div className="cli-form">
              {/* Operação */}
              <div className="cli-field">
                <label>Tipo de operação</label>
                <div className="aj-op-toggle" role="radiogroup" aria-label="Tipo de operação">
                  {[
                    { id:'entrada', label:'Entrada', ico:'↑' },
                    { id:'saida',   label:'Saída',   ico:'↓' },
                    { id:'ajuste',  label:'Acerto',  ico:'⇄' },
                  ].map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      role="radio"
                      aria-checked={operacao === op.id}
                      className={operacao === op.id ? 'active ' + op.id : ''}
                      onClick={() => setOperacao(op.id)}
                    >
                      <span className="ico">{op.ico}</span>
                      {op.label}
                    </button>
                  ))}
                </div>
                <span className="hint" style={{fontSize:11, color:'var(--fg-3)', marginTop:4}}>
                  {operacao === 'entrada' && 'Adiciona ao estoque atual (compras, devoluções).'}
                  {operacao === 'saida'   && 'Subtrai do estoque (perdas, transferências, quebras).'}
                  {operacao === 'ajuste'  && 'Define o estoque atual com um novo valor (inventário).'}
                </span>
              </div>

              <div className="row-2">
                <div className="cli-field">
                  <label htmlFor="estoque-qty">
                    {operacao === 'ajuste' ? 'Novo estoque atual' : 'Quantidade'}<span className="req">*</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="estoque-qty"
                    type="text"
                    inputMode="decimal"
                    value={quantidade}
                    onChange={(e) => { setQuantidade(e.target.value); if (erros.quantidade) setErros(x => ({...x, quantidade:null})); }}
                    placeholder="0"
                    className={'numeric' + (erros.quantidade ? ' error' : '')}
                    aria-invalid={!!erros.quantidade}
                    aria-describedby={erros.quantidade ? 'err-qty' : 'hint-qty'}
                    required
                  />
                  {erros.quantidade
                    ? <span id="err-qty" className="err">{erros.quantidade}</span>
                    : <span id="hint-qty" className="hint">em {produto.unidade_medida} ({produto.unidade_medida === 'UN' ? 'unidades' : produto.unidade_medida})</span>}
                </div>

                {operacao === 'ajuste' && (
                  <div className="cli-field">
                    <label htmlFor="estoque-min">Novo mínimo</label>
                    <input
                      id="estoque-min"
                      type="text" inputMode="decimal"
                      value={novoMinimo}
                      onChange={(e) => { setNovoMinimo(e.target.value); if (erros.minimo) setErros(x => ({...x, minimo:null})); }}
                      className={'numeric' + (erros.minimo ? ' error' : '')}
                      aria-invalid={!!erros.minimo}
                    />
                    <span className="hint">Padrão: {produto.estoque_minimo}</span>
                    {erros.minimo && <span className="err">{erros.minimo}</span>}
                  </div>
                )}
              </div>

              {/* Preview do resultado */}
              {quantidade.trim() && qtyNum >= 0 && (
                <div className="aj-preview" aria-live="polite">
                  <div className="col">
                    <div className="lbl">Antes</div>
                    <div className="val">{window.fmtNum(produto.quantidade_atual)}</div>
                  </div>
                  <div className="arrow" aria-hidden>→</div>
                  <div className="col">
                    <div className="lbl">Depois</div>
                    <div className={'val next' + (ficaraCritico ? ' alert' : '')}>
                      {window.fmtNum(novoEstoque)}
                      {ficaraCritico && (
                        <div style={{fontSize:10, color:'#fca5a5', textTransform:'uppercase', letterSpacing:'0.12em', marginTop:4, fontWeight:600}}>
                          abaixo do mínimo
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Motivo */}
              <div className="cli-field">
                <label htmlFor="estoque-motivo">Motivo<span className="req">*</span></label>
                <select
                  id="estoque-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                >
                  {motivosDoTipo.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Observação */}
              <div className="cli-field">
                <label htmlFor="estoque-obs">
                  Observação
                  {motivo === 'OUTRO' && <span className="req">*</span>}
                </label>
                <input
                  id="estoque-obs"
                  type="text"
                  value={observacao}
                  onChange={(e) => { setObservacao(e.target.value); if (erros.observacao) setErros(x => ({...x, observacao:null})); }}
                  placeholder='Detalhe do ajuste (obrigatório para motivo "Outro")'
                  maxLength={500}
                  className={erros.observacao ? 'error' : ''}
                  aria-invalid={!!erros.observacao}
                />
                {erros.observacao && <span className="err">{erros.observacao}</span>}
              </div>
            </div>
          </div>

          <footer className="venda-modal-foot" style={{justifyContent:'flex-end'}}>
            <button type="button" className="app-btn app-btn-neutral" onClick={fechar} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="submit"
              className={'app-btn ' + (operacao === 'saida' ? 'app-btn-danger' : 'app-btn-accent')}
              disabled={salvando || !quantidade.trim()}
            >
              {salvando ? 'Salvando…' :
               operacao === 'entrada' ? 'Confirmar entrada' :
               operacao === 'saida'   ? 'Confirmar saída' :
                                         'Salvar acerto'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

window.EstoqueAjusteModal = EstoqueAjusteModal;
