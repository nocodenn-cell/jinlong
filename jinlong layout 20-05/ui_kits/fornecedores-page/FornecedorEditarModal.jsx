// FornecedorEditarModal.jsx — modal criação/edição (mesmo padrão do ClienteEditarModal)

function FornecedorEditarModal({ fornecedor, onClose, onSalvar }) {
  const editando = !!fornecedor;
  const [nome, setNome]       = React.useState(fornecedor?.nome ?? '');
  const [tipo, setTipo]       = React.useState(fornecedor?.tipo ?? 'PJ');
  const [doc, setDoc]         = React.useState(fornecedor ? window.maskCNPJ(fornecedor.documento) : '');
  const [tel, setTel]         = React.useState(fornecedor ? window.maskTel(fornecedor.telefone) : '');
  const [email, setEmail]     = React.useState(fornecedor?.email ?? '');
  const [contato, setContato] = React.useState(fornecedor?.contato_pessoa ?? '');
  const [categoria, setCat]   = React.useState(fornecedor?.categoria ?? '');
  // Endereço
  const [log, setLog]       = React.useState(fornecedor?.endereco_logradouro ?? '');
  const [num, setNum]       = React.useState(fornecedor?.endereco_numero ?? '');
  const [comp, setComp]     = React.useState(fornecedor?.endereco_complemento ?? '');
  const [bairro, setBairro] = React.useState(fornecedor?.endereco_bairro ?? '');
  const [cidade, setCidade] = React.useState(fornecedor?.endereco_cidade ?? '');
  const [uf, setUf]         = React.useState(fornecedor?.endereco_uf ?? 'SP');
  const [cep, setCep]       = React.useState(fornecedor ? window.maskCEP(fornecedor.endereco_cep ?? '') : '');

  const [erros, setErros] = React.useState({});
  const [salvando, setSalvando] = React.useState(false);

  const dialogRef = React.useRef(null);
  const nomeRef = React.useRef(null);

  React.useEffect(() => {
    const triggerEl = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => nomeRef.current?.focus(), 30);

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

  function handleDoc(e) {
    const raw = e.target.value.replace(/\D/g,'').slice(0, tipo === 'PF' ? 11 : 14);
    setDoc(window.maskCNPJ(raw));
    if (erros.doc) setErros(x => ({...x, doc:null}));
  }
  function handleTel(e) {
    setTel(window.maskTel(e.target.value.replace(/\D/g,'').slice(0,11)));
    if (erros.tel) setErros(x => ({...x, tel:null}));
  }
  function handleCep(e) {
    setCep(window.maskCEP(e.target.value.replace(/\D/g,'').slice(0,8)));
  }
  function handleTipo(t) {
    setTipo(t); setDoc('');
  }

  function sujo() {
    if (!editando) return !!(nome||doc||tel||email||contato||categoria||log||num||comp||bairro||cidade||cep);
    return nome !== fornecedor.nome || doc.replace(/\D/g,'') !== fornecedor.documento ||
      tel.replace(/\D/g,'') !== fornecedor.telefone || email !== (fornecedor.email??'') ||
      contato !== (fornecedor.contato_pessoa??'') || categoria !== (fornecedor.categoria??'') ||
      log !== (fornecedor.endereco_logradouro??'') || num !== (fornecedor.endereco_numero??'') ||
      comp !== (fornecedor.endereco_complemento??'') || bairro !== (fornecedor.endereco_bairro??'') ||
      cidade !== (fornecedor.endereco_cidade??'') || uf !== (fornecedor.endereco_uf??'') ||
      cep.replace(/\D/g,'') !== (fornecedor.endereco_cep??'');
  }

  function fechar() {
    if (sujo() && !confirm('Descartar as alterações?')) return;
    onClose();
  }
  function handleBackdrop(e) { if (e.target === e.currentTarget && !salvando) fechar(); }

  function validar() {
    const e = {};
    if (!nome.trim()) e.nome = 'Informe o nome.';
    else if (nome.trim().length < 2) e.nome = 'Mínimo de 2 caracteres.';
    const docDigits = doc.replace(/\D/g,'');
    if (!docDigits) e.doc = 'Informe o documento.';
    else if (tipo === 'PF' && docDigits.length !== 11) e.doc = 'CPF deve ter 11 dígitos.';
    else if (tipo === 'PJ' && docDigits.length !== 14) e.doc = 'CNPJ deve ter 14 dígitos.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'E-mail inválido.';
    const telDigits = tel.replace(/\D/g,'');
    if (telDigits && telDigits.length < 10) e.tel = 'Telefone incompleto.';
    const cepDigits = cep.replace(/\D/g,'');
    if (cepDigits && cepDigits.length !== 8) e.cep = 'CEP deve ter 8 dígitos.';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function submeter(e) {
    e.preventDefault();
    if (!validar()) return;
    setSalvando(true);
    try {
      await new Promise(r => setTimeout(r, 320));
      onSalvar({
        nome: nome.trim(), tipo,
        documento: doc.replace(/\D/g,''),
        telefone: tel.replace(/\D/g,''),
        email: email.trim(),
        contato_pessoa: contato.trim(),
        categoria: categoria.trim(),
        endereco_logradouro: log.trim(),
        endereco_numero: num.trim(),
        endereco_complemento: comp.trim(),
        endereco_bairro: bairro.trim(),
        endereco_cidade: cidade.trim(),
        endereco_uf: uf,
        endereco_cep: cep.replace(/\D/g,''),
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="venda-modal-backdrop" onMouseDown={handleBackdrop}>
      <div ref={dialogRef} className="venda-modal" role="dialog" aria-modal="true"
        aria-labelledby="forn-modal-titulo" onMouseDown={(e) => e.stopPropagation()}
        style={{maxWidth: 680}}>
        <header className="venda-modal-head">
          <div style={{minWidth:0, flex:1}}>
            <p className="venda-modal-eyebrow">{editando ? 'Editar fornecedor · 修改' : 'Novo fornecedor · 新建'}</p>
            <h2 id="forn-modal-titulo" className="venda-modal-title">{editando ? fornecedor.nome : 'Cadastrar fornecedor'}</h2>
          </div>
          <button type="button" onClick={fechar} className="venda-modal-close" aria-label="Fechar" disabled={salvando}>✕</button>
        </header>

        <form onSubmit={submeter}>
          <div className="venda-modal-body">
            <div className="cli-form">
              <div className="cli-field">
                <label>Tipo de pessoa</label>
                <div className="cli-tipo-toggle" role="radiogroup" aria-label="Tipo de pessoa">
                  <button type="button" role="radio" aria-checked={tipo==='PJ'} className={tipo==='PJ'?'active':''} onClick={()=>handleTipo('PJ')}>PJ — Pessoa jurídica</button>
                  <button type="button" role="radio" aria-checked={tipo==='PF'} className={tipo==='PF'?'active':''} onClick={()=>handleTipo('PF')}>PF — Pessoa física</button>
                </div>
              </div>

              <div className="cli-field">
                <label htmlFor="forn-nome">{tipo === 'PJ' ? 'Razão social / nome fantasia' : 'Nome completo'}<span className="req">*</span></label>
                <input ref={nomeRef} id="forn-nome" type="text" value={nome}
                  onChange={(e) => { setNome(e.target.value); if (erros.nome) setErros(x => ({...x, nome:null})); }}
                  className={erros.nome ? 'error' : ''} maxLength={120}
                  aria-invalid={!!erros.nome} aria-describedby={erros.nome ? 'err-nome' : undefined}
                  required />
                {erros.nome && <span id="err-nome" className="err">{erros.nome}</span>}
              </div>

              <div className="row-2">
                <div className="cli-field">
                  <label htmlFor="forn-doc">{tipo === 'PF' ? 'CPF' : 'CNPJ'}<span className="req">*</span></label>
                  <input id="forn-doc" type="text" inputMode="numeric"
                    value={doc} onChange={handleDoc}
                    placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    className={'numeric' + (erros.doc ? ' error' : '')}
                    aria-invalid={!!erros.doc} aria-describedby={erros.doc ? 'err-doc' : undefined}
                    required />
                  {erros.doc && <span id="err-doc" className="err">{erros.doc}</span>}
                </div>
                <div className="cli-field">
                  <label htmlFor="forn-tel">Telefone</label>
                  <input id="forn-tel" type="tel" inputMode="tel" value={tel} onChange={handleTel}
                    placeholder="(11) 9 0000-0000"
                    className={'numeric' + (erros.tel ? ' error' : '')}
                    aria-invalid={!!erros.tel} aria-describedby={erros.tel ? 'err-tel' : undefined} />
                  {erros.tel && <span id="err-tel" className="err">{erros.tel}</span>}
                </div>
              </div>

              <div className="row-2">
                <div className="cli-field">
                  <label htmlFor="forn-email">E-mail</label>
                  <input id="forn-email" type="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); if (erros.email) setErros(x => ({...x, email:null})); }}
                    placeholder="compras@fornecedor.com.br"
                    className={erros.email ? 'error' : ''} aria-invalid={!!erros.email} />
                  {erros.email && <span className="err">{erros.email}</span>}
                </div>
                <div className="cli-field">
                  <label htmlFor="forn-contato">Pessoa de contato</label>
                  <input id="forn-contato" type="text" value={contato}
                    onChange={(e) => setContato(e.target.value)}
                    placeholder="Ex.: Wang Lei (responsável compras)" />
                </div>
              </div>

              <div className="cli-field">
                <label htmlFor="forn-cat">Categoria</label>
                <input id="forn-cat" type="text" value={categoria}
                  onChange={(e) => setCat(e.target.value)}
                  placeholder="Decoração, Joias, Cozinha, Chás…" />
              </div>

              {/* Endereço */}
              <div className="form-section">
                <div className="form-section-label">
                  Endereço <span className="han">地址</span>
                </div>

                <div className="row-cep">
                  <div className="cli-field">
                    <label htmlFor="forn-cep">CEP</label>
                    <input id="forn-cep" type="text" inputMode="numeric"
                      value={cep} onChange={handleCep} placeholder="00000-000"
                      className={'numeric' + (erros.cep ? ' error' : '')}
                      aria-invalid={!!erros.cep} />
                    {erros.cep && <span className="err">{erros.cep}</span>}
                  </div>
                  <div className="cli-field">
                    <label htmlFor="forn-log">Logradouro</label>
                    <input id="forn-log" type="text" value={log} onChange={(e) => setLog(e.target.value)} placeholder="R. Galvão Bueno" />
                  </div>
                  <div className="cli-field">
                    <label htmlFor="forn-num">Número</label>
                    <input id="forn-num" type="text" value={num} onChange={(e) => setNum(e.target.value)} placeholder="123" />
                  </div>
                </div>

                <div className="row-2" style={{marginTop:14}}>
                  <div className="cli-field">
                    <label htmlFor="forn-comp">Complemento</label>
                    <input id="forn-comp" type="text" value={comp} onChange={(e) => setComp(e.target.value)} placeholder="Sala, andar (opcional)" />
                  </div>
                  <div className="cli-field">
                    <label htmlFor="forn-bairro">Bairro</label>
                    <input id="forn-bairro" type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Liberdade" />
                  </div>
                </div>

                <div className="row-2" style={{marginTop:14}}>
                  <div className="cli-field">
                    <label htmlFor="forn-cidade">Cidade</label>
                    <input id="forn-cidade" type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" />
                  </div>
                  <div className="cli-field" style={{maxWidth:120}}>
                    <label htmlFor="forn-uf">UF</label>
                    <select id="forn-uf" value={uf} onChange={(e) => setUf(e.target.value)}>
                      {window.UFs.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <footer className="venda-modal-foot" style={{justifyContent:'flex-end'}}>
            <button type="button" className="app-btn app-btn-neutral" onClick={fechar} disabled={salvando}>Cancelar</button>
            <button type="submit" className="app-btn app-btn-accent" disabled={salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar fornecedor'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

window.FornecedorEditarModal = FornecedorEditarModal;
