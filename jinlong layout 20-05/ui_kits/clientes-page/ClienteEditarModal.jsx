// ClienteEditarModal.jsx — criação OU edição (mesmo modal, baseado em prop `cliente`).
// a11y: role=dialog aria-modal aria-labelledby; ESC fecha; focus trap; foco volta para origem.

function ClienteEditarModal({ cliente, onClose, onSalvar }) {
  const editando = !!cliente;
  const [tipo, setTipo]       = React.useState(cliente?.tipo ?? 'PF');
  const [nome, setNome]       = React.useState(cliente?.nome ?? '');
  const [documento, setDoc]   = React.useState(cliente ? window.maskDoc(cliente.documento) : '');
  const [email, setEmail]     = React.useState(cliente?.email ?? '');
  const [telefone, setTel]    = React.useState(cliente ? window.maskTel(cliente.telefone) : '');
  const [limite, setLimite]   = React.useState(cliente ? String(cliente.limite_crediario).replace('.', ',') : '0,00');
  const [enderecoStr, setEnd] = React.useState(cliente?.endereco ?? '');
  const [erros, setErros]     = React.useState({});
  const [salvando, setSalvando] = React.useState(false);

  const closeBtnRef = React.useRef(null);
  const dialogRef   = React.useRef(null);
  const nomeRef     = React.useRef(null);

  React.useEffect(() => {
    const triggerEl = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Foco no primeiro input (nome) — melhor UX para create form
    setTimeout(() => nomeRef.current?.focus(), 20);

    function onKey(e) {
      if (salvando) return;
      if (e.key === 'Escape') {
        e.preventDefault(); fechar();
      } else if (e.key === 'Tab') {
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

  function fechar() {
    if (sujo() && !confirm('Descartar as alterações?')) return;
    onClose();
  }
  function sujo() {
    if (!editando) return !!(nome || documento || email || telefone || enderecoStr || limite !== '0,00');
    return (
      nome !== cliente.nome ||
      documento.replace(/\D/g, '') !== cliente.documento ||
      email !== (cliente.email ?? '') ||
      telefone.replace(/\D/g, '') !== cliente.telefone ||
      enderecoStr !== (cliente.endereco ?? '') ||
      parseFloat(limite.replace(',', '.')) !== cliente.limite_crediario
    );
  }

  function handleDocChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, tipo === 'PF' ? 11 : 14);
    setDoc(window.maskDoc(raw));
    if (erros.documento) setErros((x) => ({...x, documento: null}));
  }
  function handleTelChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    setTel(window.maskTel(raw));
    if (erros.telefone) setErros((x) => ({...x, telefone: null}));
  }
  function handleLimChange(e) {
    let v = e.target.value.replace(/[^\d,]/g, '');
    const parts = v.split(',');
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
    setLimite(v);
  }
  function handleTipoChange(novoTipo) {
    setTipo(novoTipo);
    setDoc(''); // reseta porque PF/PJ têm comprimentos diferentes
  }

  function validar() {
    const e = {};
    if (!nome.trim()) e.nome = 'Informe o nome.';
    else if (nome.trim().length < 2) e.nome = 'Mínimo de 2 caracteres.';
    const docDigits = documento.replace(/\D/g, '');
    if (!docDigits) e.documento = 'Informe o documento.';
    else if (tipo === 'PF' && docDigits.length !== 11) e.documento = 'CPF deve ter 11 dígitos.';
    else if (tipo === 'PJ' && docDigits.length !== 14) e.documento = 'CNPJ deve ter 14 dígitos.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'E-mail inválido.';
    const telDigits = telefone.replace(/\D/g, '');
    if (telDigits && telDigits.length < 10) e.telefone = 'Telefone incompleto.';
    const lim = parseFloat(limite.replace(',', '.')) || 0;
    if (lim < 0) e.limite = 'Não pode ser negativo.';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function submeter(e) {
    e.preventDefault();
    if (!validar()) return;
    setSalvando(true);
    try {
      // simula latência do server action
      await new Promise((r) => setTimeout(r, 320));
      onSalvar({
        nome: nome.trim(),
        tipo,
        documento: documento.replace(/\D/g, ''),
        email: email.trim(),
        telefone: telefone.replace(/\D/g, ''),
        endereco: enderecoStr.trim(),
        limite_crediario: parseFloat(limite.replace(',', '.')) || 0,
      });
    } finally {
      setSalvando(false);
    }
  }

  function handleBackdrop(e) {
    if (e.target !== e.currentTarget || salvando) return;
    fechar();
  }

  return (
    <div className="venda-modal-backdrop" onMouseDown={handleBackdrop}>
      <div
        ref={dialogRef}
        className="venda-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cli-modal-titulo"
        onMouseDown={(e) => e.stopPropagation()}
        style={{maxWidth: 620}}
      >
        <header className="venda-modal-head">
          <div style={{minWidth:0, flex:1}}>
            <p className="venda-modal-eyebrow">
              {editando ? 'Editar cliente · 修改客户' : 'Novo cliente · 新建客户'}
            </p>
            <h2 id="cli-modal-titulo" className="venda-modal-title" style={{gap:10}}>
              {editando ? cliente.nome : 'Cadastrar cliente'}
            </h2>
            {editando && (
              <p style={{margin:'8px 0 0', fontSize:12, color:'var(--fg-3)'}}>
                Cadastrado em {window.fmtDate(cliente.criado_em)} ·{' '}
                {cliente.saldo_crediario > 0 ? (
                  <span>saldo aberto <b style={{color:'var(--accent)', fontFamily:'var(--font-numeric)'}}>{window.fmtBRL(cliente.saldo_crediario)}</b></span>
                ) : 'sem crediário aberto'}
              </p>
            )}
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
            <div className="cli-form">
              {/* PF / PJ */}
              <div className="cli-field">
                <label>Tipo de pessoa</label>
                <div className="cli-tipo-toggle" role="radiogroup" aria-label="Tipo de pessoa">
                  <button type="button"
                    role="radio" aria-checked={tipo === 'PF'}
                    className={tipo === 'PF' ? 'active' : ''}
                    onClick={() => handleTipoChange('PF')}>PF — Pessoa física</button>
                  <button type="button"
                    role="radio" aria-checked={tipo === 'PJ'}
                    className={tipo === 'PJ' ? 'active' : ''}
                    onClick={() => handleTipoChange('PJ')}>PJ — Pessoa jurídica</button>
                </div>
              </div>

              <div className="cli-field">
                <label htmlFor="cli-nome">
                  {tipo === 'PJ' ? 'Razão social / nome fantasia' : 'Nome completo'}
                  <span className="req">*</span>
                </label>
                <input
                  ref={nomeRef}
                  id="cli-nome" type="text"
                  value={nome} onChange={(e) => { setNome(e.target.value); if (erros.nome) setErros(x => ({...x, nome:null})); }}
                  className={erros.nome ? 'error' : ''}
                  maxLength={120}
                  aria-invalid={!!erros.nome}
                  aria-describedby={erros.nome ? 'err-nome' : undefined}
                  required
                />
                {erros.nome && <span id="err-nome" className="err">{erros.nome}</span>}
              </div>

              <div className="row-2">
                <div className="cli-field">
                  <label htmlFor="cli-doc">
                    {tipo === 'PF' ? 'CPF' : 'CNPJ'}<span className="req">*</span>
                  </label>
                  <input
                    id="cli-doc" type="text" inputMode="numeric"
                    value={documento} onChange={handleDocChange}
                    placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    className={'numeric' + (erros.documento ? ' error' : '')}
                    aria-invalid={!!erros.documento}
                    aria-describedby={erros.documento ? 'err-doc' : undefined}
                    required
                  />
                  {erros.documento && <span id="err-doc" className="err">{erros.documento}</span>}
                </div>

                <div className="cli-field">
                  <label htmlFor="cli-tel">Telefone</label>
                  <input
                    id="cli-tel" type="tel" inputMode="tel"
                    value={telefone} onChange={handleTelChange}
                    placeholder="(11) 9 0000-0000"
                    className={'numeric' + (erros.telefone ? ' error' : '')}
                    aria-invalid={!!erros.telefone}
                    aria-describedby={erros.telefone ? 'err-tel' : undefined}
                  />
                  {erros.telefone && <span id="err-tel" className="err">{erros.telefone}</span>}
                </div>
              </div>

              <div className="cli-field">
                <label htmlFor="cli-email">E-mail</label>
                <input
                  id="cli-email" type="email"
                  value={email} onChange={(e) => { setEmail(e.target.value); if (erros.email) setErros(x => ({...x, email:null})); }}
                  placeholder="cliente@example.com"
                  className={erros.email ? 'error' : ''}
                  aria-invalid={!!erros.email}
                  aria-describedby={erros.email ? 'err-email' : undefined}
                />
                {erros.email && <span id="err-email" className="err">{erros.email}</span>}
              </div>

              <div className="cli-field">
                <label htmlFor="cli-end">Endereço (opcional)</label>
                <input
                  id="cli-end" type="text"
                  value={enderecoStr} onChange={(e) => setEnd(e.target.value)}
                  placeholder="Rua, número, bairro, cidade / UF"
                  maxLength={180}
                />
              </div>

              <div className="cli-field">
                <label htmlFor="cli-lim">Limite de crediário</label>
                <div style={{display:'flex', gap:10, alignItems:'center'}}>
                  <span style={{
                    height:40, display:'inline-flex', alignItems:'center', padding:'0 12px',
                    border:'1px solid var(--border-1)', borderRadius:8,
                    background:'rgba(2,6,23,0.55)', color:'var(--fg-3)', fontSize:14,
                  }}>R$</span>
                  <input
                    id="cli-lim" type="text" inputMode="decimal"
                    value={limite} onChange={handleLimChange}
                    placeholder="0,00"
                    className={'numeric' + (erros.limite ? ' error' : '')}
                    style={{textAlign:'right', flex:1}}
                  />
                </div>
                <span className="hint">Limite máximo de compras a prazo. Use 0 para desabilitar crediário.</span>
                {erros.limite && <span className="err">{erros.limite}</span>}
              </div>
            </div>
          </div>

          <footer className="venda-modal-foot" style={{justifyContent:'flex-end'}}>
            <button type="button" className="app-btn app-btn-neutral" onClick={fechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="app-btn app-btn-accent" disabled={salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar cliente'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

window.ClienteEditarModal = ClienteEditarModal;
