import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { tentar } from '@/lib/seguro'
import { formatDate, parseFilters } from '@/lib/model'
import { ACTIVITY_LABEL, agruparAgenda, DEFAULT_STAGES, memberName, semAcompanhamento, stageLabel, type ActivityWithLead } from '@/lib/crm'
import { Flash, Shell } from '../Shell'
import { concludeActivity } from '../leads/actions'

export const dynamic = 'force-dynamic'

function Lista({ titulo, itens, membros, stages, tom }: { titulo: string; itens: ActivityWithLead[]; membros: Parameters<typeof memberName>[0]; stages: Parameters<typeof stageLabel>[0]; tom?: 'late' }) {
  return (
    <section className="hub-panel" aria-label={titulo}>
      <h2>{titulo} <span className="hub-count-inline">{itens.length}</span></h2>
      <ul className="hub-acts">
        {itens.map((a) => (
          <li key={a.id} className={tom === 'late' ? 'hub-acts--late' : undefined}>
            <div>
              <strong>{formatDate(a.agendada_para)}</strong> · {ACTIVITY_LABEL[a.tipo]} · {memberName(membros, a.responsavel_id)}
              <br />{a.lead ? <Link href={`/leads/${a.lead.id}`}>{a.lead.store}</Link> : 'Lead'}{a.lead ? ` (${stageLabel(stages, a.lead.status)})` : ''} — {a.titulo}
            </div>
            <details>
              <summary>Concluir</summary>
              <form action={concludeActivity} className="hub-note">
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="leadId" value={a.lead_id} /><input type="hidden" name="voltar" value="agenda" />
                <label><span>Resultado</span><textarea name="resultado" required minLength={2} maxLength={2000} rows={2} /></label>
                <div className="hub-form-row">
                  <button type="submit" className="hub-btn">Concluir</button>
                  <button type="submit" name="cancelar" value="1" className="hub-link">Cancelar atividade</button>
                </div>
              </form>
            </details>
          </li>
        ))}
        {itens.length === 0 && <li className="hub-empty">Nada aqui.</li>}
      </ul>
    </section>
  )
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { repo, demo, papel, me } = await requireMember()
  const sp = await searchParams
  const todos = papel === 'gestor' && sp.ver === 'equipe'
  const [ativ, stages, members, leads] = await Promise.all([
    tentar('agenda:list', () => repo.listAgenda(todos ? null : me), []),
    tentar('agenda:listStages', () => repo.listStages(), DEFAULT_STAGES),
    tentar('agenda:listMembers', () => repo.listMembers(), []),
    tentar('agenda:leads', () => repo.dashboardSource({ ...parseFilters({ period: 'all' }), owner: todos ? null : 'me' }, me), { leads: [], activities: [], proposals: [] }),
  ])
  const g = agruparAgenda(ativ.value)
  const parados = semAcompanhamento(leads.value.leads, leads.value.activities, stages.value)
  return (
    <Shell demo={demo} active="agenda" papel={papel}>
      <div className="hub-head">
        <h1>Agenda e follow-up</h1>
        {papel === 'gestor' && (
          <nav className="hub-tabs" aria-label="Escopo">
            <Link href="/agenda" aria-current={!todos ? 'page' : undefined}>Minha agenda</Link>
            <Link href="/agenda?ver=equipe" aria-current={todos ? 'page' : undefined}>Equipe toda</Link>
          </nav>
        )}
      </div>
      <Flash msg={typeof sp.msg === 'string' ? sp.msg : undefined} erro={typeof sp.erro === 'string' ? sp.erro : undefined} />
      {ativ.falhou && <p className="hub-error" role="alert">Não foi possível carregar a agenda agora.</p>}
      <p className="hub-help">Agende ligações, demonstrações, reuniões e retornos na ficha do lead. Nada é enviado automaticamente ao cliente.</p>
      <div className="hub-grid2">
        <div className="hub-stack">
          <Lista titulo="Atrasadas" itens={g.atrasadas} membros={members.value} stages={stages.value} tom="late" />
          <Lista titulo="Hoje" itens={g.hoje} membros={members.value} stages={stages.value} />
          <Lista titulo="Próximos 7 dias" itens={g.proximas} membros={members.value} stages={stages.value} />
        </div>
        <section className="hub-panel" aria-labelledby="h-parados">
          <h2 id="h-parados">Oportunidades sem acompanhamento <span className="hub-count-inline">{parados.length}</span></h2>
          <p className="hub-help">Em aberto, sem atividade agendada e sem contato há mais de 3 dias.</p>
          <ul className="hub-recent">
            {parados.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`}><strong>{l.store}</strong></Link>
                <span>{stageLabel(stages.value, l.status)} · {memberName(members.value, l.owner_id)} · {l.ultimo_contato_em ? `último contato ${formatDate(l.ultimo_contato_em)}` : 'nunca contatado'}</span>
                <span className="hub-badge hub-badge--perdido">{l.diasParado} dias</span>
              </li>
            ))}
            {parados.length === 0 && <li>Nenhuma oportunidade parada.</li>}
          </ul>
        </section>
      </div>
    </Shell>
  )
}
