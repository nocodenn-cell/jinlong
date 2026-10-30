import Link from 'next/link'
import { requireAdmin } from '@/lib/session'
import { computeStats, formatDate, PRODUCT_LABEL, PRODUCTS, STATUS_LABEL, STATUSES } from '@/lib/model'
import { trialStats } from '@/lib/conversao'
import { Shell, StatusBadge } from './Shell'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const { repo, demo } = await requireAdmin()
  const [source, recent, customers, trials] = await Promise.all([repo.statsSource(), repo.recentLeads(6), repo.listCustomers(), repo.listTrials()])
  const s = computeStats(source)
  const ts = trialStats(trials)
  const active = customers.filter((c) => c.subscription_status === 'ativo').length
  return (
    <Shell demo={demo} active="painel">
      <h1>Painel</h1>
      <section className="hub-cards" aria-label="Resumo">
        <div className="hub-card"><span>Leads (total)</span><strong>{s.total}</strong></div>
        <div className="hub-card"><span>Novos em 7 dias</span><strong>{s.last7}</strong></div>
        <div className="hub-card"><span>A contatar</span><strong>{s.byStatus.novo}</strong></div>
        <div className="hub-card"><span>Lojas contratadas ativas</span><strong>{active}</strong></div>
        <div className="hub-card"><span>Conversão (fechados)</span><strong>{s.conversion}%</strong></div>
        <Link className="hub-card hub-card--link" href="/conversao"><span>Testes grátis ativos</span><strong>{ts.emTeste}</strong></Link>
        <Link className="hub-card hub-card--link" href="/conversao?prioridade=alta"><span>Oportunidades prioritárias</span><strong>{ts.altaPrioridade}</strong></Link>
      </section>
      <div className="hub-grid2">
        <section aria-labelledby="h-funil" className="hub-panel">
          <h2 id="h-funil">Funil por status</h2>
          <ul className="hub-funnel">
            {STATUSES.map((st) => (
              <li key={st}>
                <Link href={`/leads?status=${st}&period=all`}><StatusBadge status={st} label={STATUS_LABEL[st]} /></Link>
                <span className="hub-bar" style={{ width: `${s.total ? Math.max(4, (s.byStatus[st] / s.total) * 100) : 4}%` }} aria-hidden="true" />
                <strong>{s.byStatus[st]}</strong>
              </li>
            ))}
          </ul>
          <h2>Por produto</h2>
          <ul className="hub-inline">
            {PRODUCTS.map((p) => (
              <li key={p}><Link href={`/leads?product=${p}&period=all`}>{PRODUCT_LABEL[p]}</Link>: <strong>{s.byProduct[p]}</strong></li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="h-rec" className="hub-panel">
          <h2 id="h-rec">Últimos pedidos</h2>
          <ul className="hub-recent">
            {recent.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`}><strong>{l.store}</strong></Link>
                <span>{l.name} · {PRODUCT_LABEL[l.product]} · {formatDate(l.created_at)}</span>
                <StatusBadge status={l.status} label={STATUS_LABEL[l.status]} />
              </li>
            ))}
            {recent.length === 0 && <li>Nenhum pedido ainda.</li>}
          </ul>
          <Link className="hub-btn" href="/leads">Ver todos os leads</Link>
        </section>
      </div>
    </Shell>
  )
}
