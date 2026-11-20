import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { tentar } from '@/lib/seguro'
import { formatDate, parseFilters, PRODUCT_LABEL, PRODUCTS } from '@/lib/model'
import { ACTIVITY_LABEL, DEFAULT_STAGES, memberName, sortedStages, type DashProposal } from '@/lib/crm'
import { formatBRL } from '@/lib/conversao'
import { Flash, Shell } from '../Shell'
import { changeStatus } from '../leads/actions'
import { Kanban, type KColumn } from './Kanban'

export const dynamic = 'force-dynamic'

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { repo, demo, papel, me } = await requireMember()
  const sp = await searchParams
  const f = parseFilters(sp)
  const [src, stages, members] = await Promise.all([
    tentar('pipeline:source', () => repo.pipelineSource(f, me), { leads: [], proposals: [], pending: [] }),
    tentar('pipeline:listStages', () => repo.listStages(), DEFAULT_STAGES),
    tentar('pipeline:listMembers', () => repo.listMembers(), []),
  ])
  const now = Date.now()
  const ultima = new Map<string, DashProposal>()
  for (const p of src.value.proposals) { const c = ultima.get(p.lead_id); if (!c || p.versao > c.versao) ultima.set(p.lead_id, p) }
  const proxima = new Map<string, { tipo: string; quando: string }>()
  for (const a of src.value.pending) if (!proxima.has(a.lead_id)) proxima.set(a.lead_id, { tipo: a.tipo, quando: a.agendada_para })
  const columns: KColumn[] = sortedStages(stages.value)
    .filter((s) => s.ativo || src.value.leads.some((l) => l.status === s.codigo))
    .map((s) => {
      const leads = src.value.leads.filter((l) => l.status === s.codigo)
      const soma = leads.reduce((t, l) => t + (ultima.get(l.id)?.valor_mensal_centavos ?? 0), 0)
      return {
        codigo: s.codigo, rotulo: s.rotulo, tipo: s.tipo, total: soma ? formatBRL(soma) : null,
        cards: leads.map((l) => {
          const px = proxima.get(l.id)
          const p = ultima.get(l.id)
          return {
            id: l.id, store: l.store, name: l.name, status: l.status, owner: memberName(members.value, l.owner_id),
            dias: Math.max(0, Math.floor((now - new Date(l.etapa_desde ?? l.updated_at).getTime()) / 86_400_000)),
            valor: p ? formatBRL(p.valor_mensal_centavos) : null,
            proxima: px ? `${ACTIVITY_LABEL[px.tipo as keyof typeof ACTIVITY_LABEL] ?? px.tipo} · ${formatDate(px.quando)}` : null,
            atrasada: px ? new Date(px.quando).getTime() < now : false,
          }
        }),
      }
    })
  return (
    <Shell demo={demo} active="pipeline" papel={papel}>
      <div className="hub-head">
        <h1>Pipeline comercial</h1>
        <Link className="hub-btn" href="/leads/novo">+ Novo lead</Link>
      </div>
      <Flash msg={typeof sp.msg === 'string' ? sp.msg : undefined} erro={typeof sp.erro === 'string' ? sp.erro : undefined} />
      {src.falhou && <p className="hub-error" role="alert">Não foi possível carregar o pipeline agora.</p>}
      <form className="hub-filters" method="get" aria-label="Filtrar pipeline">
        <label><span>Responsável</span>
          <select name="owner" defaultValue={f.owner ?? ''}>
            <option value="">{papel === 'gestor' ? 'Toda a equipe' : 'Meus e sem responsável'}</option>
            <option value="me">Só meus</option><option value="none">Sem responsável</option>
            {papel === 'gestor' && members.value.filter((m) => m.user_id !== me).map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
          </select>
        </label>
        <label><span>Produto</span>
          <select name="product" defaultValue={f.product ?? ''}><option value="">Todos</option>{PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}</select>
        </label>
        <button type="submit" className="hub-btn">Filtrar</button>
        <Link href="/pipeline" className="hub-link">Limpar</Link>
      </form>
      <p className="hub-help">Arraste o cartão para outra etapa ou use “Mover…”. Perder ou reabrir pede motivo. Convertido/Perdido mostram os últimos 30 dias. Valores = última proposta aberta (mensal).</p>
      <Kanban columns={columns} action={changeStatus} />
    </Shell>
  )
}
