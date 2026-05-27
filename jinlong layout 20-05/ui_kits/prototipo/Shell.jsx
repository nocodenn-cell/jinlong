// Shell.jsx — sidebar + content frame + global modal/drawer slots.

const NAV_GROUPS = [
  {
    id: 'caixa',
    label: 'PDV — Caixa',
    han: '收银',
    items: [
      { id: 'caixa',           label: 'Operar caixa',         icon: 'cart',     surface: 'caixa'   },
      { id: 'abertura',        label: 'Abertura de caixa',    icon: 'unlock',   surface: 'caixa'   },
      { id: 'fechamento',      label: 'Fechamento de caixa',  icon: 'lock',     surface: 'caixa'   },
      { id: 'devolucao',       label: 'Devolução / Troca',    icon: 'reverse',  surface: 'caixa'   },
      { id: 'pagamento',       label: 'Pagamento',            icon: 'pay',      surface: 'caixa'   },
      { id: 'recibo',          label: 'Recibo / Cupom',       icon: 'receipt',  surface: 'caixa'   },
    ],
  },
  {
    id: 'gerente',
    label: 'Painel Gerente',
    han: '管理',
    items: [
      { id: 'inicio',          label: 'Início (dashboard)',   icon: 'home',     surface: 'gerente' },
      { id: 'historico',       label: 'Histórico de vendas',  icon: 'history',  surface: 'gerente' },
      { id: 'produtos',        label: 'Produtos',             icon: 'box',      surface: 'gerente' },
      { id: 'estoque',         label: 'Estoque',              icon: 'boxes',    surface: 'gerente' },
      { id: 'clientes',        label: 'Clientes',             icon: 'user',     surface: 'gerente' },
      { id: 'fornecedores',    label: 'Fornecedores',         icon: 'truck',    surface: 'gerente' },
      { id: 'nfe',             label: 'Importação NF-e',      icon: 'file',     surface: 'gerente', badge: '3' },
      { id: 'financeiro',      label: 'Relatórios — financeiro', icon: 'chart', surface: 'gerente' },
      { id: 'fiscal',          label: 'Relatórios — fiscal',  icon: 'shield',   surface: 'gerente' },
      { id: 'usuarios',        label: 'Usuários e permissões', icon: 'users',   surface: 'gerente' },
      { id: 'config',          label: 'Configurações',        icon: 'gear',     surface: 'gerente' },
    ],
  },
];

// Tiny inline SVG icons — Lucide-flavoured
const NavIcon = {
  cart:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  unlock:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  lock:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  reverse: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/><path d="M21 17v-6h-6"/><path d="M3 7a9 9 0 0 1 15 6.7l3-2.7"/></svg>,
  pay:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="6" width="20" height="14" rx="2"/><line x1="2" y1="11" x2="22" y2="11"/></svg>,
  receipt: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>,
  home:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  history: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3v5h5"/><path d="M3.05 13a9 9 0 1 0 .5-4"/><polyline points="12 7 12 12 14.5 14"/></svg>,
  box:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  boxes:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l4.97 2.98a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 11.5l-5 2Z"/></svg>,
  user:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  truck:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  file:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>,
  chart:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  shield:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>,
  users:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  gear:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>,
  bell:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
  search:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

function Sidebar({ activeId, onSelect }) {
  return (
    <aside className="proto-sidebar" data-screen-label="sidebar">
      <div className="proto-sidebar-brand">
        <img src="../../assets/brand-double-dragon.png" alt="Jīn Lóng" />
        <div className="pb-text">
          <span className="pb-han">金龍</span>
          <span className="pb-sub">Jīn Lóng · PDV</span>
        </div>
      </div>
      <div className="proto-sidebar-scroll">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="proto-section">
            <div className="proto-section-label">
              <span>{group.label}</span>
              <span className="han">{group.han}</span>
            </div>
            {group.items.map((item) => (
              <button
                key={item.id}
                className={'proto-nav-link' + (item.id === activeId ? ' active' : '')}
                onClick={() => onSelect(item.id)}
              >
                <span className="ico">{NavIcon[item.icon]}</span>
                <span>{item.label}</span>
                {item.badge && <span className="badge">{item.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="proto-sidebar-foot">
        <span className="proto-avatar">MW</span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
          <span style={{ color: 'var(--fg-1)', fontWeight: 600, fontSize: 12 }}>M. Wei</span>
          <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>Gerente · loja Paulista</span>
        </div>
      </div>
    </aside>
  );
}

function TopContextBar({ surface, screenLabel, screenHan, extras }) {
  const [now, setNow] = React.useState(new Date('2026-05-14T18:42:00'));
  React.useEffect(() => {
    const id = setInterval(() => setNow((d) => new Date(d.getTime() + 60000)), 60000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="proto-content-context">
      <div className="pcx-left">
        <span className={'pcx-dot' + (surface === 'gerente' ? ' jade' : '')} />
        <span>{surface === 'caixa' ? 'Surface · Caixa (pdv-local)' : 'Surface · Gerente (pdv-importados)'}</span>
        <span style={{ color: 'var(--border-strong)' }}>·</span>
        <span style={{ color: 'var(--fg-2)' }}>{screenLabel}</span>
        {screenHan && <span className="pcx-han">{screenHan}</span>}
      </div>
      <div className="pcx-right">
        {extras}
        <span className="proto-clock">{window.fmtDate(now)} · {window.fmtTime(now)}</span>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
window.TopContextBar = TopContextBar;
window.NavIcon = NavIcon;
window.NAV_GROUPS = NAV_GROUPS;
