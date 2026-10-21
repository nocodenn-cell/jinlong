import Link from 'next/link'

export function Shell({ demo, active, children }: { demo: boolean; active: 'painel' | 'leads' | 'clientes'; children: React.ReactNode }) {
  const nav = [
    ['painel', '/', 'Painel'],
    ['leads', '/leads', 'Leads'],
    ['clientes', '/clientes', 'Lojas contratadas'],
  ] as const
  return (
    <>
      {demo && (
        <div className="hub-demo" role="note">
          DADOS FICTÍCIOS — modo de demonstração, sem banco conectado. Nenhum nome ou contato é real.
        </div>
      )}
      <header className="hub-top">
        <div className="hub-brand">
          <strong>Nature Code</strong> <span>Hub comercial</span>
        </div>
        <nav aria-label="Principal">
          {nav.map(([id, href, label]) => (
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
