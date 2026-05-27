// GerenteTopBar.jsx — sticky brand + nav + user chip.
function GerenteTopBar({ active = 'inicio', user = 'M. Wei', role = 'Gerente' }) {
  const links = [
    { id: 'inicio',     label: 'Início',     href: '#' },
    { id: 'caixas',     label: 'Caixas',     href: '#' },
    { id: 'estoque',    label: 'Estoque',    href: '#' },
    { id: 'financeiro', label: 'Financeiro', href: '#' },
    { id: 'relatorios', label: 'Relatórios', href: '#' },
    { id: 'produtos',   label: 'Produtos',   href: '#' },
  ];
  const initials = user.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="ger-topbar">
      <div className="ger-brand">
        <img src="../../assets/brand-double-dragon.png" alt="" />
        <div className="ger-brand-text">
          <div className="ger-brand-han">金龍</div>
          <div className="ger-brand-main">Jīn Lóng</div>
        </div>
      </div>
      <nav className="ger-nav" aria-label="Painel gerente">
        {links.map((l) => (
          <a key={l.id} href={l.href} className={l.id === active ? 'active' : ''}>{l.label}</a>
        ))}
      </nav>
      <div className="ger-user">
        <span className="ger-user-text">
          <span style={{fontWeight: 600, color: 'var(--fg-1)'}}>{user}</span>
          <span style={{fontSize: 11, color: 'var(--fg-3)'}}>{role}</span>
        </span>
        <span className="ger-avatar">{initials}</span>
      </div>
    </header>
  );
}

window.GerenteTopBar = GerenteTopBar;
