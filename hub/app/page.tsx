import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { formatDate, ORIGEM_LABEL, ORIGENS, parseFilters, PERIOD_LABEL, PERIODS, PRODUCT_LABEL, PRODUCTS, type LeadFilters } from '@/lib/model'
import { computeDashboard, DEFAULT_STAGES, formatHoras, memberName, semAcompanhamento, stageLabel, type Breakdown } from '@/lib/crm'
import { formatBRL, trialStats } from '@/lib/conversao'
import { tentar } from '@/lib/seguro'
import { Kpi, Shell, StatusBadge } from './Shell'

export const dynamic = 'force-dynamic'

function qs(f: LeadFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ period: f.period })
  if (f.origem) p.set('origem', f.origem)
  if (f.owner) p.set('owner', f.owner)
  if (f.product) p.set('product', f.product)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return p.toString()
}

function Tabela({ titulo, linhas, link }: { titulo: string; linhas: Breakdown[]; link?: (b: Breakdown) => string | null }) {
  return (
    <section className="hub-panel" aria-label={titulo}>
      <h2>{titulo}</h2>
      {linhas.length === 0 ? <p className="hub-empty">Sem leads no filtro.</p> : (
        <table className="hub-table hub-table--compact">
          <thead><tr><th scope="col">{titulo.split(' por ')[1] ?? 'Item'}</th><th scope="col">Leads</th><th scope="col">Abertos</th><th scope="col">Convertidos</th><th scope="col">Perdidos</th><th scope="col">Conversão</th></tr></thead>
          <tbody>
            {linhas.map((b) => {
              const href = link?.(b)
              return (
                <tr key={b.chave || '-'}>
                  <td data-label="Item">{href ? <Link href={href}>{b.rotulo}</Link> : b.rotulo}</td>
                  <td data-label="Leads">{b.total}</td>
                  <td data-label="Abertos">{b.abertos}</td>
                  <td data-label="Convertidos">{b.convertidos}</td>
                  <td data-label="Perdidos">{b.perdidos}</td>
                  <td data-label="Conversão">{b.taxa === null ? '—' : `${b.taxa}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { repo, demo, papel, me } = await requireMember()
  const sp = await searchParams
  const f = parseFilters(sp)
  // Cada seção degrada sozinha: uma leitura com falha não derruba o painel inteiro.
  const [src, stages, members, trials] = await Promise.all([
    tentar('painel:dashboardSource', () => repo.dashboardSource(f, me), { leads: [], activities: [], proposals: [] }),
    tentar('painel:listStages', () => repo.listStages(), DEFAULT_STAGES),
    tentar('painel:listMembers', () => repo.listMembers(), []),
    papel === 'gestor' ? tentar('painel:listTrials', () => repo.listTrials(), []) : Promise.resolve({ value: [], falhou: true }),
  ])
  const d = computeDashboard(src.value.leads, src.value.activities, src.value.proposals, stages.value, members.value)
  const alertas = semAcompanhamento(src.value.leads, src.value.activities, stages.value).slice(0, 8)
  const ts = trialStats(trials.value)
  const maxEtapa = Math.max(1, ...d.porEtapa.map((e) => e.n))
  return (
    <Shell demo={demo} active="painel" papel={papel}>
      <div className="hub-head">
        <h1>Painel comercial</h1>
        <Link className="hub-btn" href="/leads/novo">+ Novo lead</Link>
      </div>
      {sp.aviso === 'gestor' && <p className="hub-error" role="alert">Essa área é exclusiva do gestor comercial.</p>}
      {src.falhou && <p className="hub-error" role="alert">Os indicadores não puderam ser carregados agora. Tente de novo em instantes.</p>}
      <form className="hub-filters" method="get" aria-label="Filtrar indicadores">
        <label><span>Entrada do lead</span>
          <select name="period" defaultValue={f.period}>{PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}</select>
        </label>
        <label><span>Origem</span>
          <select name="origem" defaultValue={f.origem ?? ''}><option value="">Todas</option>{ORIGENS.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o]}</option>)}</select>
        </label>
        <label><span>Responsável</span>
          <select name="owner" defaultValue={f.owner ?? ''}>
            <option value="">{papel === 'gestor' ? 'Toda a equipe' : 'Meus e sem responsável'}</option>
            <option value="me">Só meus</option>
            <option value="none">Sem responsável</option>
            {papel === 'gestor' && members.value.filter((m) => m.ativo && m.user_id !== me).map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
          </select>
        </label>
        <label><span>Produto</span>
          <select name="product" defaultValue={f.product ?? ''}><option value="">Todos</option>{PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}</select>
        </label>
        <button type="submit" className="hub-btn">Aplicar</button>
        <Link href="/" className="hub-link">Limpar</Link>
      </form>
      <p className="hub-help">Todos os números contam os leads que <strong>entraram</strong> no período e filtros acima. Clique num indicador para ver a lista que o compõe.</p>

      <section className="hub-cards hub-cards--kpi" aria-label="Indicadores">
        <Kpi label="Total de leads" value={d.total} href={`/leads?${qs(f)}`} />
        <Kpi label="Novos (sem atendimento)" value={d.novos} href={`/leads?${qs(f, { status: 'novo' })}`} />
        <Kpi label="Em qualificação" value={d.qualificacao} href={`/leads?${qs(f, { status: 'qualificacao' })}`} />
        <Kpi label="Oportunidades abertas" value={d.abertas} href={`/pipeline?${qs(f)}`} hint="Etapas em aberto, exceto Novo" />
        <Kpi label="Demonstrações agendadas" value={d.demosAgendadas} href="/agenda" />
        <Kpi label="Propostas enviadas" value={d.propostasEnviadas} hint="Leads da coorte" />
        <Kpi label="Clientes convertidos" value={d.convertidos} href={`/leads?${qs(f, { status: 'contratado' })}`} />
        <Kpi label="Leads perdidos" value={d.perdidos} href={`/leads?${qs(f, { status: 'perdido' })}`} />
        <Kpi label="Taxa de conversão" value={d.taxaConversao === null ? '—' : `${d.taxaConversao}%`} hint="Convertidos ÷ (convertidos + perdidos)" />
        <Kpi label="1º atendimento (média)" value={formatHoras(d.tempoPrimeiroAtendimentoH)} hint={`${d.semAtendimento} ainda sem atendimento`} />
        <Kpi label="Receita potencial (mensal)" value={formatBRL(d.receitaPotencialCentavos)} hint="Última proposta aberta de cada lead" />
        {papel === 'gestor' && <Kpi label="Testes grátis ativos" value={trials.falhou ? '—' : ts.emTeste} href="/conversao" hint={trials.falhou ? 'Central indisponível' : `${ts.altaPrioridade} com prioridade alta`} />}
      </section>

      <div className="hub-grid2">
        <section aria-labelledby="h-funil" className="hub-panel">
          <h2 id="h-funil">Funil por etapa</h2>
          <ul className="hub-funnel">
            {d.porEtapa.map((e) => (
              <li key={e.codigo}>
                <Link href={`/leads?${qs(f, { status: e.codigo })}`}><StatusBadge status={e.codigo} label={e.rotulo} /></Link>
                <span className={`hub-bar hub-bar--${e.tipo}`} style={{ width: `${Math.max(3, (e.n / maxEtapa) * 100)}%` }} aria-hidden="true" />
                <strong>{e.n}</strong>
              </li>
            ))}
          </ul>
          {d.motivosPerda.length > 0 && (<>
            <h2>Motivos de perda</h2>
            <ul className="hub-list">{d.motivosPerda.map((m) => <li key={m.motivo}><span>{m.motivo}</span><strong>{m.n}</strong></li>)}</ul>
          </>)}
        </section>
        <section aria-labelledby="h-alert" className="hub-panel">
          <h2 id="h-alert">Sem acompanhamento</h2>
          <p className="hub-help">Leads em aberto, sem nada agendado e sem contato há mais de 3 dias.</p>
          <ul className="hub-recent">
            {alertas.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`}><strong>{l.store ?? 'Lead'}</strong></Link>
                <span>{stageLabel(stages.value, l.status)} · {memberName(members.value, l.owner_id)} · {l.ultimo_contato_em ? `último contato ${formatDate(l.ultimo_contato_em)}` : 'nunca contatado'}</span>
                <span className="hub-badge hub-badge--perdido">{l.diasParado} dias</span>
              </li>
            ))}
            {alertas.length === 0 && <li>Nenhum lead parado.</li>}
          </ul>
          <Link className="hub-btn hub-btn--ghost" href="/agenda">Abrir agenda</Link>
        </section>
      </div>

      <div className="hub-grid2 hub-mt">
        <Tabela titulo="Conversão por origem" linhas={d.porOrigem} link={(b) => `/leads?${qs({ ...f, origem: null }, { origem: b.chave })}`} />
        <Tabela titulo="Conversão por campanha" linhas={d.porCampanha} />
      </div>
      {papel === 'gestor' && (
        <div className="hub-mt"><Tabela titulo="Resultado por responsável" linhas={d.porResponsavel} link={(b) => `/leads?${qs({ ...f, owner: null }, { owner: b.chave || 'none' })}`} /></div>
      )}
    </Shell>
  )
}
