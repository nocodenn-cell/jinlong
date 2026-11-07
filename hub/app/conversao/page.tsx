import Link from 'next/link'
import { requireAdmin } from '@/lib/session'
import {
  FASE_LABEL, FASES, INTERESSE_LABEL, listarTrials, parseTrialFilters, PRIORIDADE_LABEL, PRIORIDADES, trialStats, type TrialRow,
} from '@/lib/conversao'
import { formatDate, STATUS_LABEL } from '@/lib/model'
import { Shell, StatusBadge } from '../Shell'

export const dynamic = 'force-dynamic'

function Prazo({ t }: { t: TrialRow }) {
  if (t.fase === 'cliente') return <span className="hub-badge hub-badge--contratado">Cliente pagante</span>
  if (t.fase === 'encerrado') return <span className="hub-badge hub-badge--perdido">Encerrado</span>
  if (t.fase === 'expirado') return <span className="hub-badge hub-badge--novo">Expirou há {Math.abs(t.dias)} dia(s)</span>
  return <span className={`hub-badge ${t.fase === 'expira_logo' ? 'hub-badge--demonstracao' : 'hub-badge--contatado'}`}>{t.dias <= 0 ? 'Termina hoje' : `${t.dias} dia(s) restantes`}</span>
}

export default async function ConversaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { repo, demo } = await requireAdmin()
  const f = parseTrialFilters(await searchParams)
  const all = await repo.listTrials()
  const s = trialStats(all)
  const rows = listarTrials(all, f)
  return (
    <Shell demo={demo} active="conversao">
      <h1>Central de Conversão</h1>
      <p className="hub-help">
        Comerciantes que se cadastraram pelo teste grátis. Toda contratação é aprovada aqui, manualmente — nenhuma cobrança é criada automaticamente.
      </p>
      <section className="hub-cards" aria-label="Resumo dos testes grátis">
        <Link className="hub-card hub-card--link" href="/conversao?fase=em_teste"><span>Em teste agora</span><strong>{s.emTeste}</strong></Link>
        <Link className="hub-card hub-card--link" href="/conversao?fase=expira_logo"><span>Expiram em até 3 dias</span><strong>{s.expiraLogo}</strong></Link>
        <Link className="hub-card hub-card--link" href="/conversao?prioridade=alta"><span>Prioridade alta</span><strong>{s.altaPrioridade}</strong></Link>
        <div className="hub-card"><span>Pediram para contratar</span><strong>{s.pedidos}</strong></div>
        <Link className="hub-card hub-card--link" href="/conversao?fase=cliente"><span>Convertidos</span><strong>{s.clientes}</strong></Link>
        <div className="hub-card"><span>Conversão (testes encerrados)</span><strong>{s.conversao}%</strong></div>
      </section>
      <form className="hub-filters" method="get" role="search" aria-label="Filtrar testes grátis">
        <label>
          <span>Buscar</span>
          <input type="search" name="q" defaultValue={f.q} placeholder="Empresa, dono, e-mail, telefone ou protocolo" maxLength={60} />
        </label>
        <label>
          <span>Período de avaliação</span>
          <select name="fase" defaultValue={f.fase ?? ''}>
            <option value="">Todos</option>
            {FASES.map((x) => <option key={x} value={x}>{FASE_LABEL[x]}</option>)}
          </select>
        </label>
        <label>
          <span>Prioridade</span>
          <select name="prioridade" defaultValue={f.prioridade ?? ''}>
            <option value="">Todas</option>
            {PRIORIDADES.map((x) => <option key={x} value={x}>{PRIORIDADE_LABEL[x]}</option>)}
          </select>
        </label>
        <button type="submit" className="hub-btn">Filtrar</button>
        <Link href="/conversao" className="hub-link">Limpar</Link>
      </form>
      <p className="hub-count" role="status">{rows.length} teste(s) · ordenados por oportunidade</p>
      <div className="hub-table-wrap">
        <table className="hub-table">
          <caption className="hub-sr">Testes grátis</caption>
          <thead>
            <tr>
              <th scope="col">Prioridade</th><th scope="col">Empresa</th><th scope="col">Avaliação</th>
              <th scope="col">Uso no sistema</th><th scope="col">Funil</th><th scope="col">Próximo passo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.empresa_id}>
                <td data-label="Prioridade">
                  {t.score.nivel
                    ? <span className={`hub-prio hub-prio--${t.score.nivel}`} title={t.score.motivos.join(' · ')}>{PRIORIDADE_LABEL[t.score.nivel]}</span>
                    : <span className="hub-help">—</span>}
                  {t.score.motivos[0] && <small className="hub-why">{t.score.motivos[0]}</small>}
                </td>
                <td data-label="Empresa">
                  <Link href={`/conversao/${t.empresa_id}`}><strong>{t.empresa_nome}</strong></Link>
                  <br /><small>{t.lead?.name ?? 'Sem ficha comercial'}</small>
                </td>
                <td data-label="Avaliação"><Prazo t={t} /><br /><small>Início {formatDate(t.criado_em)}</small></td>
                <td data-label="Uso">
                  <small>
                    {t.atividade.vendas_total} venda(s) · {t.atividade.produtos_proprios} produto(s)
                    <br />Último acesso: {t.atividade.ultimo_acesso ? formatDate(t.atividade.ultimo_acesso) : 'nunca'}
                  </small>
                </td>
                <td data-label="Funil">
                  {t.lead ? <StatusBadge status={t.lead.status} label={STATUS_LABEL[t.lead.status]} /> : '—'}
                  {t.lead?.interesse && <><br /><small>Interesse {INTERESSE_LABEL[t.lead.interesse].toLowerCase()}</small></>}
                </td>
                <td data-label="Próximo passo">
                  {t.solicitou_contratacao_em && t.fase !== 'cliente'
                    ? <strong className="hub-alert">Pediu para contratar</strong>
                    : t.lead?.proximo_contato ? <small>Retornar em {t.lead.proximo_contato.split('-').reverse().join('/')}</small>
                    : <small>{t.ultimo_contato_em ? `Último contato ${formatDate(t.ultimo_contato_em)}` : 'Sem contato ainda'}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="hub-empty">Nenhum teste grátis com esses filtros.</p>}
      </div>
    </Shell>
  )
}
