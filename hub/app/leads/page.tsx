import Link from 'next/link'
import { requireAdmin } from '@/lib/session'
import { formatDate, parseFilters, PERIOD_LABEL, PERIODS, PRODUCT_LABEL, PRODUCTS, STATUS_LABEL, STATUSES } from '@/lib/model'
import { Shell, StatusBadge } from '../Shell'

export const dynamic = 'force-dynamic'

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { repo, demo } = await requireAdmin()
  const f = parseFilters(await searchParams)
  const leads = await repo.listLeads(f)
  return (
    <Shell demo={demo} active="leads">
      <h1>Leads</h1>
      <form className="hub-filters" method="get" role="search" aria-label="Filtrar leads">
        <label>
          <span>Buscar</span>
          <input type="search" name="q" defaultValue={f.q} placeholder="Nome, loja, contato ou protocolo" maxLength={60} />
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={f.status ?? ''}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label>
          <span>Produto</span>
          <select name="product" defaultValue={f.product ?? ''}>
            <option value="">Todos</option>
            {PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}
          </select>
        </label>
        <label>
          <span>Período</span>
          <select name="period" defaultValue={f.period}>
            {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </label>
        <button type="submit" className="hub-btn">Filtrar</button>
        <Link href="/leads" className="hub-link">Limpar</Link>
      </form>
      <p className="hub-count" role="status">{leads.length} lead(s)</p>
      <div className="hub-table-wrap">
        <table className="hub-table">
          <caption className="hub-sr">Leads filtrados</caption>
          <thead>
            <tr><th scope="col">Recebido</th><th scope="col">Loja</th><th scope="col">Nome</th><th scope="col">Contato</th><th scope="col">Produto</th><th scope="col">Status</th><th scope="col">Protocolo</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td data-label="Recebido">{formatDate(l.created_at)}</td>
                <td data-label="Loja"><Link href={`/leads/${l.id}`}><strong>{l.store}</strong></Link></td>
                <td data-label="Nome">{l.name}</td>
                <td data-label="Contato">{l.channel === 'whatsapp' ? 'WhatsApp' : 'WeChat'}: {l.contact}</td>
                <td data-label="Produto">{PRODUCT_LABEL[l.product]}</td>
                <td data-label="Status"><StatusBadge status={l.status} label={STATUS_LABEL[l.status]} /></td>
                <td data-label="Protocolo"><code>{l.protocol}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <p className="hub-empty">Nenhum lead com esses filtros.</p>}
      </div>
    </Shell>
  )
}
