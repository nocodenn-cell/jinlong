import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/session'
import { CHANNEL_LABEL, EVENT_LABEL, formatDate, isUuid, PRODUCT_LABEL, STATUS_LABEL, STATUSES } from '@/lib/model'
import { Shell, StatusBadge } from '../../Shell'
import { addEvent, changeStatus } from '../actions'

export const dynamic = 'force-dynamic'

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params
  const { msg } = await searchParams
  if (!isUuid(id)) notFound()
  const { repo, demo } = await requireAdmin()
  const data = await repo.getLead(id)
  if (!data) notFound()
  const { lead, events, customer } = data
  return (
    <Shell demo={demo} active="leads">
      <p><Link href="/leads" className="hub-link">← Leads</Link></p>
      <h1>{lead.store}</h1>
      {msg && <p className="hub-msg" role="status">{msg.slice(0, 120)}</p>}
      <div className="hub-grid2">
        <section className="hub-panel" aria-labelledby="h-dados">
          <h2 id="h-dados">Dados do pedido</h2>
          <dl className="hub-dl">
            <dt>Nome</dt><dd>{lead.name}</dd>
            <dt>Contato</dt><dd>{CHANNEL_LABEL[lead.channel]}: {lead.contact}</dd>
            {lead.origem === 'teste_gratis' && lead.empresa_id && (<><dt>Origem</dt><dd><Link href={`/conversao/${lead.empresa_id}`}>Teste grátis · abrir na Central de Conversão</Link></dd></>)}
            <dt>Produto</dt><dd>{PRODUCT_LABEL[lead.product]}</dd>
            <dt>Idioma</dt><dd>{lead.locale === 'zh-CN' ? 'Chinês' : 'Português'}</dd>
            <dt>Protocolo</dt><dd><code>{lead.protocol}</code></dd>
            <dt>Recebido</dt><dd>{formatDate(lead.created_at)}</dd>
            <dt>Status</dt><dd><StatusBadge status={lead.status} label={STATUS_LABEL[lead.status]} /></dd>
            {customer && (<><dt>Loja contratada</dt><dd><Link href="/clientes">desde {customer.contracted_at.split('-').reverse().join('/')}</Link></dd></>)}
          </dl>
          <form action={changeStatus} className="hub-form-row">
            <input type="hidden" name="leadId" value={lead.id} />
            <label>
              <span>Mudar status</span>
              <select name="status" defaultValue={lead.status}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <button type="submit" className="hub-btn">Salvar status</button>
          </form>
          <p className="hub-help">
            {lead.origem === 'teste_gratis'
              ? 'Teste grátis: a contratação é feita na Central de Conversão (ajusta plano e assinatura).'
              : 'Ao marcar “Contratado”, a loja entra automaticamente em “Lojas contratadas”.'}
          </p>
        </section>
        <section className="hub-panel" aria-labelledby="h-hist">
          <h2 id="h-hist">Histórico de contatos e notas</h2>
          <form action={addEvent} className="hub-note">
            <input type="hidden" name="leadId" value={lead.id} />
            <fieldset>
              <legend>Tipo</legend>
              <label><input type="radio" name="kind" value="contato" defaultChecked /> Contato realizado</label>
              <label><input type="radio" name="kind" value="nota" /> Nota</label>
            </fieldset>
            <label>
              <span>Descrição</span>
              <textarea name="body" required minLength={2} maxLength={2000} rows={3} />
            </label>
            <button type="submit" className="hub-btn">Adicionar ao histórico</button>
          </form>
          <ol className="hub-timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span className="hub-when">{formatDate(e.created_at)} · {EVENT_LABEL[e.kind]}</span>
                {e.kind === 'status' && e.from_status && e.to_status
                  ? <span>{STATUS_LABEL[e.from_status]} → {STATUS_LABEL[e.to_status]}</span>
                  : <span>{e.body}</span>}
              </li>
            ))}
            {events.length === 0 && <li>Sem registros ainda.</li>}
          </ol>
        </section>
      </div>
    </Shell>
  )
}
