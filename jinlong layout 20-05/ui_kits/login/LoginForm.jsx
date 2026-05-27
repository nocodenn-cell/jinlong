// LoginForm.jsx — underline-input form with luxury-gold submit.
// Bespoke `.login-premium-*` styles, NOT the standard app-btn / app-input.
function LoginForm({ onSubmit }) {
  const [email, setEmail] = React.useState('demo-gerente@jinlong.test');
  const [senha, setSenha] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState('');

  function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    setTimeout(() => {
      if (!senha) { setErr('Email ou senha incorretos'); setLoading(false); return; }
      setLoading(false);
      onSubmit && onSubmit({ email, senha });
    }, 900);
  }

  return (
    <form className="login-premium-form-block" onSubmit={submit}>
      <div className="login-premium-field">
        <label className="login-premium-label" htmlFor="login-email">E-mail</label>
        <input id="login-email" type="email" autoComplete="username" required autoFocus
          className="login-premium-input"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="operador@loja.com.br" />
      </div>
      <div className="login-premium-field">
        <label className="login-premium-label" htmlFor="login-senha">Senha</label>
        <input id="login-senha" type="password" autoComplete="current-password" required
          className="login-premium-input"
          value={senha} onChange={(e) => setSenha(e.target.value)}
          placeholder="••••••••" />
      </div>
      {err ? <p className="login-premium-error" role="alert">{err}</p> : null}
      <button type="submit" disabled={loading} className="login-premium-submit">
        {loading ? (
          <>
            <span className="dragon-orbit-wrap" aria-hidden>
              <img src="../../assets/dragon-ouroboros-amber.png" width={16} height={16} alt="" />
            </span>
            Entrando…
          </>
        ) : 'Entrar'}
      </button>
    </form>
  );
}

window.LoginForm = LoginForm;
