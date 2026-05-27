// VendaDetalheModal.jsx — modal acessível com detalhe da venda.
// Acessibilidade:
//   - role="dialog" aria-modal="true" aria-labelledby
//   - Esc fecha; backdrop click fecha (não fecha se há texto no campo de cancelamento)
//   - Foco volta para a linha de origem ao fechar
//   - Foco inicial no botão de fechar
//   - Bloqueio do scroll do body enquanto aberto
// Carregamento: simula busca de itens em ~250ms (o mock já tem _itens; em prod
// chamaríamos a server action `buscarVendaDetalheAction(id)`).

function VendaDetalheModal({ venda, onClose, onCancelar }) {
  const [carregando, setCarregando] = React.useState(true);
  const [itens, setItens] = React.useState([]);
  const [motivo, setMotivo] = React.useState('');
  const [confirmandoCancelamento, setConfirmandoCancelamento] = React.useState(false);
  const closeBtnRef = React.useRef(null);
  const dialogRef = React.useRef(null);

  // ESC + lock body scroll + restaurar foco
  React.useEffect(() => {
    const triggerEl = document.activeElement; // a linha clicada
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        // trap focus dentro do diálogo
        const focusables = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    };
  }, [onClose]);

  // Simula a action remota que traz os itens da venda
  React.useEffect(() => {
    setCarregando(true);
    setItens([]);
    const id = setTimeout(() => {
      setItens(venda._itens || []);
      setCarregando(false);
    }, 280);
    return () => clearTimeout(id);
  }, [venda.id]);

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) {
      if (motivo.trim()) {
        if (!confirm('Você digitou um motivo de cancelamento. Descartar e fechar?')) return;
      }
      onClose();
    }
  }

  function copiarId() {
    navigator.clipboard?.writeText(venda.id);
  }

  function statusClass(s) {
    if (s === 'CANCELADA') return 'vendas-status-cancelada';
    if (s === 'CONCLUIDA') return 'vendas-status-concluida';
    return 'vendas-status-pendente';
  }

  function submeterCancelamento(e) {
    e.preventDefault();
    if (motivo.trim().length < 2) return;
    if (!confirm(`Confirma o cancelamento da venda ${window.fmtIdCurto(venda.id)}? Esta ação não pode ser desfeita.`)) return;
    onCancelar(venda.id, motivo.trim());
    setMotivo('');
    setConfirmandoCancelamento(false);
  }

  const isCancelada = venda.status === 'CANCELADA';
  const totalItens = itens.reduce((s, it) => s + it.quantidade, 0);

  return (
    <div className="venda-modal-backdrop" onMouseDown={handleBackdrop}>
      <div
        ref={dialogRef}
        className="venda-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="venda-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Head */}
        <div className="venda-modal-head">
          <div style={{minWidth:0, flex:1}}>
            <p className="venda-modal-eyebrow">Venda · 销售</p>
            <h2 id="venda-modal-title" className="venda-modal-title">
              {window.fmtBRL(venda.total_liquido)}
              <span className={statusClass(venda.status)}>{window.STATUS_LABEL[venda.status]}</span>
            </h2>
            <div style={{marginTop:10, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
              <span className="vm-id-chip" title={venda.id}>
                ID {venda.id.slice(0,8)}…{venda.id.slice(-4)}
                <button onClick={copiarId} aria-label="Copiar ID da venda">copiar</button>
              </span>
              {venda.numero_nf && (
                <span className="vm-id-chip">NF nº {venda.numero_nf}</span>
              )}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            className="venda-modal-close"
            onClick={onClose}
            aria-label="Fechar detalhe da venda"
          >✕</button>
        </div>

        {/* Body */}
        <div className="venda-modal-body">
          <div className="vm-summary-grid">
            <div className="vm-summary-item">
              <div className="label">Data</div>
              <div className="value num">{window.fmtDateTime(venda.data)}</div>
            </div>
            <div className="vm-summary-item">
              <div className="label">Forma de pagamento</div>
              <div className="value">{window.FORMA_LABEL[venda.forma_pagamento] || venda.forma_pagamento}</div>
            </div>
            <div className="vm-summary-item">
              <div className="label">Tipo</div>
              <div className="value">{venda.tipo_venda}</div>
            </div>
            <div className="vm-summary-item">
              <div className="label">Operador</div>
              <div className="value">{venda.operador_nome || '—'}</div>
            </div>
            <div className="vm-summary-item">
              <div className="label">Caixa</div>
              <div className="value num">{window.fmtIdCurto(venda.caixa_id)}…</div>
            </div>
            {isCancelada && venda.cancelamento_motivo && (
              <div className="vm-summary-item" style={{gridColumn:'1 / -1'}}>
                <div className="label" style={{color:'#fca5a5'}}>Motivo do cancelamento</div>
                <div className="value" style={{color:'#fecaca'}}>{venda.cancelamento_motivo}</div>
              </div>
            )}
          </div>

          <div className="vm-total-banner">
            <div>
              <div className="label">Total líquido</div>
              <div className="total">{window.fmtBRL(venda.total_liquido)}</div>
            </div>
            <div className="breakdown">
              Bruto · <b style={{color:'var(--fg-2)'}}>{window.fmtBRL(venda.total_bruto)}</b><br/>
              Desconto · <b style={{color: venda.total_desconto > 0 ? '#fca5a5' : 'var(--fg-3)'}}>
                {venda.total_desconto > 0 ? '−' : ''}{window.fmtBRL(venda.total_desconto)}
              </b>
            </div>
          </div>

          <h3 className="vm-section-title">
            <span>Itens da venda</span>
            <span className="han">商品明细 · {totalItens > 0 ? `${totalItens} un` : ''}</span>
          </h3>

          {carregando ? (
            <div className="vm-loading-itens">
              <span className="vendas-loader-orbit" />
              <span>Carregando itens…</span>
            </div>
          ) : itens.length === 0 ? (
            <div className="vm-loading-itens">Nenhum item nesta venda.</div>
          ) : (
            <table className="vm-items-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Código</th>
                  <th style={{textAlign:'right'}}>Qtd</th>
                  <th style={{textAlign:'right'}}>Preço un.</th>
                  <th style={{textAlign:'right'}}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const subtotal = it.quantidade * it.preco_unitario;
                  return (
                    <tr key={it.id}>
                      <td>
                        <div className="produto-nome">{it.produto_nome}</div>
                        <div className="produto-han">{it.produto_han}</div>
                      </td>
                      <td className="codigo">{it.produto_codigo}</td>
                      <td className="num" style={{textAlign:'right'}}>{it.quantidade}</td>
                      <td className="num" style={{textAlign:'right'}}>
                        {window.fmtBRL(it.preco_unitario)}
                        {it.desconto_unitario > 0 && (
                          <div style={{fontSize:10, color:'#fde68a', textDecoration:'line-through'}}>
                            {window.fmtBRL(it.preco_unitario_original)}
                          </div>
                        )}
                      </td>
                      <td className="num" style={{textAlign:'right', fontWeight:600}}>{window.fmtBRL(subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Foot */}
        <div className="venda-modal-foot">
          {!isCancelada ? (
            <form className="vm-cancel-form" onSubmit={submeterCancelamento}>
              <input
                type="text"
                placeholder="Motivo do cancelamento (mín. 2 caracteres)…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                minLength={2}
                maxLength={500}
                required
                aria-label="Motivo do cancelamento"
              />
              <button
                type="submit"
                className="app-btn app-btn-danger"
                disabled={motivo.trim().length < 2}
              >Cancelar venda</button>
            </form>
          ) : (
            <div className="vm-cancelada-info">
              <span style={{fontFamily:'var(--font-serif-han)', fontSize:18, color:'#fca5a5'}}>印</span>
              <span>Esta venda já foi <b>cancelada</b>. Não é possível reverter.</span>
            </div>
          )}
          <button className="app-btn app-btn-neutral" onClick={onClose}>Fechar · Esc</button>
        </div>
      </div>
    </div>
  );
}

window.VendaDetalheModal = VendaDetalheModal;
