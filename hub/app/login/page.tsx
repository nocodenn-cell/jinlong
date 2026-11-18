import { login } from './actions'

const ERRORS: Record<string, string> = {
  invalid: 'E-mail ou senha incorretos.',
  forbidden: 'Esta conta não tem acesso de administrador ao hub.',
  config: 'O hub ainda não está conectado ao banco (configuração pendente).',
  indisponivel: 'Não foi possível verificar seu acesso agora. Tente de novo em instantes.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; origem?: string }> }) {
  const { e, origem } = await searchParams
  return (
    <main className="hub-login">
      <form action={login} className="hub-panel" aria-labelledby="h-login">
        <p className="hub-brand"><strong>Nature Code</strong> <span>Hub comercial</span></p>
        <h1 id="h-login">Entrar</h1>
        {e && ERRORS[e] && <p className="hub-error" role="alert">{ERRORS[e]}</p>}
        {!e && origem === 'jinlong' && (
          <p className="hub-help" role="status">Conta de administrador da plataforma: confirme a senha para abrir o painel gerencial.</p>
        )}
        <label><span>E-mail</span><input type="email" name="email" required autoComplete="username" /></label>
        <label><span>Senha</span><input type="password" name="password" required autoComplete="current-password" /></label>
        <button type="submit" className="hub-btn">Entrar</button>
        <p className="hub-help">Acesso restrito à equipe comercial da Nature Code.</p>
      </form>
    </main>
  )
}
