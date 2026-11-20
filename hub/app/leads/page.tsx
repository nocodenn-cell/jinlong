import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { tentar } from '@/lib/seguro'
import { CHANNEL_LABEL, formatDate, ORIGEM_LABEL, ORIGENS, PAGE_SIZE, parseFilters, PERIOD_LABEL, PERIODS, PRODUCT_LABEL, PRODUCTS, type LeadFilters } from '@/lib/model'
import { DEFAULT_STAGES, memberName, sortedStages, stageLabel } from '@/lib/crm'
import { Shell, StatusBadge } from '../Shell'

export const dynamic = 'force-dynamic'

function pageHref(f: LeadFilters, page: number): string {
  const p = new URLSearchParams({ period: f.period, page: String(page) })
  for (const k of ['q', 'status', 'product', 'origem', 'owner'] as const) { const v = f[k]; if (v) p.set(k, String(v)) }
  return `/leads?${p.toString()}`
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { repo, demo, papel, me } = await requireMember()
  const f = parseFilters(await searchParams)
  const [r, stages, members] = await Promise.all([
    tentar('leads:listLeadsPage', () => repo.listLeadsPage(f, me), { rows: [], total: 0 }),
    tentar('leads:listStages', () => repo.listStages(), DEFAULT_STAGES),
    tentar('leads:listMembers', () => repo.listMembers(), []),
  ])
  const { rows: leads, total } = r.value
  const page = f.page ?? 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <Shell demo={demo} active="leads" papel={papel}>
      <div className="hub-head">
        <h1>Leads</h1>
        <Link className="hub-btn" href="/leads/novo">+ Novo lead</Link>
      </div>
      <form className="hub-filters" method="get" role="search" aria-label="Filtrar leads">
        <label>
          <span>Buscar</span>
          <input type="search" name="q" defaultValue={f.q} placeholder="Nome, empresa, contato, e-mail, cidade ou protocolo" maxLength={60} />
        </label>
        <label><span>Etapa</span>
          <select name="status" defaultValue={f.status ?? ''}><option value="">Todas</option>{sortedStages(stages.value).map((s) => <option key={s.codigo} value={s.codigo}>{s.rotulo}</option>)}</select>
        </label>
        <label><span>Responsável</span>
          <select name="owner" defaultValue={f.owner ?? ''}>
            <option value="">Todos</option><option value="me">Só meus</option><option value="none">Sem responsável</option>
            {papel === 'gestor' && members.value.filter((m) => m.user_id !== me).map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
          </select>
        </label>
        <label><span>Origem</span>
          <select name="origem" defaultValue={f.origem ?? ''}><option value="">Todas</option>{ORIGENS.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o]}</option>)}</select>
        </label>
        <label><span>Produto</span>
          <select name="product" defaultValue={f.product ?? ''}><option value="">Todos</option>{PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}</select>
        </label>
        <label><span>Entrada</span>
          <select name="period" defaultValue={f.period}>{PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}</select>
        </label>
        <button type="submit" className="hub-btn">Filtrar</button>
        <Link href="/leads" className="hub-link">Limpar</Link>
      </form>
      {r.falhou && <p className="hub-error" role="alert">Não foi possível carregar os leads agora. Tente de novo em instantes.</p>}
      <p className="hub-count" role="status">{total} lead(s){total > PAGE_SIZE && ` · página ${page} de ${pages}`}</p>
      <div className="hub-table-wrap">
        <table className="hub-table">
          <caption className="hub-sr">Leads filtrados</caption>
          <thead>
            <tr><th scope="col">Entrada</th><th scope="col">Empresa / loja</th><th scope="col">Contato</th><th scope="col">Origem</th><th scope="col">Responsável</th><th scope="col">Etapa</th><th scope="col">Último contato</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td data-label="Entrada">{formatDate(l.created_at)}</td>
                <td data-label="Empresa"><Link href={`/leads/${l.id}`}><strong>{l.store}</strong></Link><br /><small>{l.name}{l.city ? ` · ${l.city}${l.uf ? `/${l.uf}` : ''}` : ''} · {PRODUCT_LABEL[l.product]}</small></td>
                <td data-label="Contato">{CHANNEL_LABEL[l.channel]}: {l.contact}</td>
                <td data-label="Origem">{ORIGEM_LABEL[l.origem] ?? l.origem}{l.utm_campaign ? <><br /><small>{l.utm_campaign}</small></> : null}</td>
                <td data-label="Responsável">{memberName(members.value, l.owner_id)}</td>
                <td data-label="Etapa"><StatusBadge status={l.status} label={stageLabel(stages.value, l.status)} /></td>
                <td data-label="Último contato">{l.ultimo_contato_em ? formatDate(l.ultimo_contato_em) : <span className="hub-alert">nunca</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <p className="hub-empty">Nenhum lead com esses filtros.</p>}
      </div>
      {pages > 1 && (
        <nav className="hub-pager" aria-label="Páginas">
          {page > 1 ? <Link className="hub-btn hub-btn--ghost" href={pageHref(f, page - 1)}>← Anterior</Link> : <span />}
          <span>Página {page} de {pages}</span>
          {page < pages ? <Link className="hub-btn hub-btn--ghost" href={pageHref(f, page + 1)}>Próxima →</Link> : <span />}
        </nav>
      )}
    </Shell>
  )
}
