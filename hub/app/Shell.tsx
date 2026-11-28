import Link from 'next/link'

type Active = 'painel' | 'pipeline' | 'leads' | 'agenda' | 'conversao' | 'clientes' | 'equipe'

/** Menu por papel é só conveniência: cada página e cada RPC verificam o papel no servidor/banco. */
export function Shell({ demo, active, papel = 'gestor', children }: { demo: boolean; active: Active; papel?: 'gestor' | 'vendedor'; children: React.ReactNode }) {
  const nav: ReadonlyArray<readonly [Active, string, string, boolean]> = [
    ['painel', '/', 'Painel', false],
    ['pipeline', '/pipeline', 'Pipeline', false],
    ['leads', '/leads', 'Leads', false],
    ['agenda', '/agenda', 'Agenda', false],
    ['conversao', '/conversao', 'Central de Conversão', true],
    ['clientes', '/clientes', 'Clientes', true],
    ['equipe', '/equipe', 'Equipe', true],
  ]
  return (
    <>
      <a className="hub-skip" href="#conteudo">Pular para o conteúdo</a>
      {demo && (
        <div className="hub-demo" role="note">
          DADOS FICTÍCIOS — modo de demonstração, sem banco conectado. Nenhum nome ou contato é real.
        </div>
      )}
      <header className="hub-top">
        <div className="hub-brand">
          <strong>Nature Code</strong> <span>Central Comercial</span>
          <span className={`hub-role hub-role--${papel}`}>{papel === 'gestor' ? 'Gestor' : 'Vendedor'}</span>
        </div>
        <nav aria-label="Principal">
          {nav.filter(([, , , gestor]) => !gestor || papel === 'gestor').map(([id, href, label]) => (
            <Link key={id} href={href} aria-current={active === id ? 'page' : undefined}>
              {label}
            </Link>
          ))}
          <form action="/logout" method="post">
            <button type="submit" className="hub-link">Sair</button>
          </form>
        </nav>
      </header>
      <main className="hub-main" id="conteudo">{children}</main>
    </>
  )
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`hub-badge hub-badge--${status}`}>{label}</span>
}

export function Flash({ msg, erro }: { msg?: string; erro?: string }) {
  if (erro) return <p className="hub-error" role="alert">{erro.slice(0, 200)}</p>
  if (msg) return <p className="hub-msg" role="status">{msg.slice(0, 200)}</p>
  return null
}

/** Cartão de indicador. `href` aponta para a lista que explica o número (rastreabilidade). */
export function Kpi({ label, value, href, hint }: { label: string; value: React.ReactNode; href?: string; hint?: string }) {
  const body = (<><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</>)
  return href ? <Link className="hub-card hub-card--link" href={href}>{body}</Link> : <div className="hub-card">{body}</div>
}
