import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/session'
import { tentar } from '@/lib/seguro'
import { CHANNEL_LABEL, EVENT_LABEL, formatDate, formatDay, isUuid, ORIGEM_LABEL, PRODUCT_LABEL } from '@/lib/model'
import { ACTIVITY_LABEL, ACTIVITY_TYPES, DEFAULT_STAGES, emailLink, memberName, PROPOSAL_ABERTA, PROPOSAL_LABEL, PROPOSAL_NEXT, sortedStages, stageLabel, stageTipo, whatsappLink } from '@/lib/crm'
import { formatBRL } from '@/lib/conversao'
import { Flash, Shell, StatusBadge } from '../../Shell'
import { addEvent, assignLead, changeStatus, concludeActivity, convertLead, createProposal, scheduleActivity, setProposalStatus, updateLead } from '../actions'

export const dynamic = 'force-dynamic'

const SEGMENTOS = [['importados', 'Importados'], ['eletronicos', 'Eletrônicos'], ['utilidades', 'Utilidades'], ['atacado', 'Atacado'], ['moda', 'Moda'], ['outro', 'Outro']] as const
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; erro?: string }> }) {
  const { id } = await params
  const { msg, erro } = await searchParams
  if (!isUuid(id)) notFound()
  const { repo, demo, papel, me } = await requireMember()
  const data = await repo.getLead(id)
  if (!data) notFound()
  const [stages, members, planos] = await Promise.all([
    tentar('lead:listStages', () => repo.listStages(), DEFAULT_STAGES),
    tentar('lead:listMembers', () => repo.listMembers(), []),
    tentar('lead:listPlanos', () => repo.listPlanos(), []),
  ])
  const { lead, events, customer, activities, proposals, duplicates, audit } = data
  const tipo = stageTipo(stages.value, lead.status)
  const aberto = tipo === 'aberta'
  const trial = lead.origem === 'teste_gratis'
  const wa = whatsappLink(lead)
  const mail = emailLink(lead)
  const pendentes = activities.filter((a) => !a.concluida_em && !a.cancelada_em).sort((a, b) => a.agendada_para.localeCompare(b.agendada_para))
  const feitas = activities.filter((a) => a.concluida_em || a.cancelada_em)
  const convertiveis = proposals.filter((p) => PROPOSAL_ABERTA(p.status))
  const ativos = members.value.filter((m) => m.ativo)
  const nomeAutor = (u: string | null | undefined) => (u ? memberName(members.value, u) : 'Sistema')
  const hoje = hojeSP()
  return (
    <Shell demo={demo} active="leads" papel={papel}>
      <p><Link href="/leads" className="hub-link">← Leads</Link> · <Link href="/pipeline" className="hub-link">Pipeline</Link></p>
      <div className="hub-head">
        <div>
          <h1>{lead.store}</h1>
          <p className="hub-sub">
            <StatusBadge status={lead.status} label={stageLabel(stages.value, lead.status)} /> {PRODUCT_LABEL[lead.product]} · {ORIGEM_LABEL[lead.origem] ?? lead.origem}
            {lead.utm_campaign ? ` · campanha ${lead.utm_campaign}` : ''} · <code>{lead.protocol}</code>
          </p>
        </div>
        <div className="hub-actions">
          {wa && <a className="hub-btn hub-btn--ghost" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {mail && <a className="hub-btn hub-btn--ghost" href={mail}>E-mail</a>}
        </div>
      </div>
      <Flash msg={msg} erro={erro} />
      {lead.motivo_perda && tipo === 'perdida' && <p className="hub-error">Perdido: {lead.motivo_perda}</p>}
      {customer && <p className="hub-msg">Cliente desde {formatDay(customer.contracted_at)} · {customer.plan ?? 'plano não informado'}{customer.monthly_value !== null ? ` · ${formatBRL(Math.round(customer.monthly_value * 100))}/mês` : ''} {papel === 'gestor' && <Link href="/clientes">ver clientes</Link>}</p>}
      {duplicates.length > 0 && (
        <div className="hub-warn" role="note">
          <strong>Possível duplicidade:</strong> {duplicates.map((d, i) => <span key={d.id}>{i ? ', ' : ' '}<Link href={`/leads/${d.id}`}>{d.store}</Link> ({stageLabel(stages.value, d.status)})</span>)}. Confira antes de converter.
        </div>
      )}

      <div className="hub-grid2">
        <div className="hub-stack">
          <section className="hub-panel" aria-labelledby="h-etapa">
            <h2 id="h-etapa">Etapa e responsável</h2>
            <dl className="hub-dl">
              <dt>Etapa</dt><dd>{stageLabel(stages.value, lead.status)}{lead.etapa_desde ? ` desde ${formatDate(lead.etapa_desde)}` : ''}</dd>
              <dt>Responsável</dt><dd>{memberName(members.value, lead.owner_id)}</dd>
              <dt>Entrada</dt><dd>{formatDate(lead.created_at)}</dd>
              <dt>1º atendimento</dt><dd>{lead.primeiro_atendimento_em ? formatDate(lead.primeiro_atendimento_em) : <span className="hub-alert">pendente</span>}</dd>
              <dt>Último contato</dt><dd>{lead.ultimo_contato_em ? formatDate(lead.ultimo_contato_em) : '—'}</dd>
              <dt>Próxima atividade</dt><dd>{pendentes[0] ? `${ACTIVITY_LABEL[pendentes[0].tipo]} · ${formatDate(pendentes[0].agendada_para)}` : <span className="hub-alert">nada agendado</span>}</dd>
            </dl>
            {tipo !== 'ganha' && (
              <form action={changeStatus} className="hub-form-row">
                <input type="hidden" name="leadId" value={lead.id} />
                <label><span>Mover para</span>
                  <select name="status" defaultValue={lead.status}>
                    {sortedStages(stages.value).filter((s) => s.ativo && s.tipo !== 'ganha').map((s) => <option key={s.codigo} value={s.codigo}>{s.rotulo}</option>)}
                  </select>
                </label>
                <label><span>Motivo (obrigatório para Perdido ou reabrir)</span><input name="motivo" maxLength={500} /></label>
                <button type="submit" className="hub-btn">Mover</button>
              </form>
            )}
            <p className="hub-help">{trial ? 'Teste grátis: a contratação é feita na Central de Conversão (ajusta a assinatura).' : '“Convertido” só pela conversão, com proposta aceita.'}
              {trial && lead.empresa_id && papel === 'gestor' && <> <Link href={`/conversao/${lead.empresa_id}`}>Abrir na Central</Link></>}</p>
            {papel === 'gestor' ? (
              <form action={assignLead} className="hub-form-row hub-mt">
                <input type="hidden" name="leadId" value={lead.id} />
                <label><span>Responsável</span>
                  <select name="owner" defaultValue={lead.owner_id ?? ''}>
                    <option value="">Sem responsável</option>
                    {ativos.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome} ({m.papel})</option>)}
                  </select>
                </label>
                <button type="submit" className="hub-btn hub-btn--ghost">Atribuir</button>
              </form>
            ) : !lead.owner_id && (
              <form action={assignLead} className="hub-mt">
                <input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="owner" value={me} />
                <button type="submit" className="hub-btn hub-btn--ghost">Assumir este lead</button>
              </form>
            )}
          </section>

          <section className="hub-panel" aria-labelledby="h-dados">
            <h2 id="h-dados">Dados do lead</h2>
            <form action={updateLead} className="hub-form-grid">
              <input type="hidden" name="leadId" value={lead.id} />
              <label><span>Nome do contato</span><input name="name" defaultValue={lead.name} required minLength={2} maxLength={80} /></label>
              <label><span>Empresa / loja</span><input name="store" defaultValue={lead.store} required minLength={2} maxLength={120} /></label>
              <label><span>Contato ({CHANNEL_LABEL[lead.channel]})</span><input name="contact" defaultValue={lead.contact} required minLength={3} maxLength={60} /></label>
              <label><span>Telefone / WhatsApp</span><input name="phone" defaultValue={lead.phone ?? ''} maxLength={25} inputMode="tel" /></label>
              <label><span>E-mail</span><input type="email" name="email" defaultValue={lead.email ?? ''} maxLength={254} /></label>
              <label><span>Segmento</span>
                <select name="segment" defaultValue={lead.segment ?? ''}><option value="">—</option>{SEGMENTOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
              <label><span>Cidade</span><input name="city" defaultValue={lead.city ?? ''} maxLength={80} /></label>
              <label><span>UF</span><input name="uf" defaultValue={lead.uf ?? ''} maxLength={2} /></label>
              <label><span>Funcionários</span><input name="funcionarios" defaultValue={lead.funcionarios ?? ''} inputMode="numeric" /></label>
              <label><span>Unidades / lojas</span><input name="unidades" defaultValue={lead.unidades ?? ''} inputMode="numeric" /></label>
              <label><span>Próximo contato</span><input type="date" name="proximo_contato" defaultValue={lead.proximo_contato ?? ''} /></label>
              <label className="hub-span2"><span>Observações</span><textarea name="observacoes" defaultValue={lead.observacoes ?? ''} maxLength={4000} rows={3} /></label>
              <div className="hub-span2"><button type="submit" className="hub-btn">Salvar dados</button></div>
            </form>
            {lead.wechat && <p className="hub-help">WeChat informado no site: {lead.wechat}</p>}
          </section>
        </div>

        <div className="hub-stack">
          <section className="hub-panel" aria-labelledby="h-agenda">
            <h2 id="h-agenda">Agenda e follow-up</h2>
            <ul className="hub-acts">
              {pendentes.map((a) => (
                <li key={a.id} className={new Date(a.agendada_para) < new Date() ? 'hub-acts--late' : undefined}>
                  <div><strong>{ACTIVITY_LABEL[a.tipo]}</strong> · {formatDate(a.agendada_para)} · {memberName(members.value, a.responsavel_id)}<br />{a.titulo}</div>
                  <details>
                    <summary>Concluir</summary>
                    <form action={concludeActivity} className="hub-note">
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="leadId" value={lead.id} />
                      <label><span>Resultado</span><textarea name="resultado" required minLength={2} maxLength={2000} rows={2} /></label>
                      <div className="hub-form-row">
                        <button type="submit" className="hub-btn">Concluir</button>
                        <button type="submit" name="cancelar" value="1" className="hub-link">Cancelar atividade</button>
                      </div>
                    </form>
                  </details>
                </li>
              ))}
              {pendentes.length === 0 && <li className="hub-empty">Nada agendado.</li>}
            </ul>
            {aberto && (
              <details open={pendentes.length === 0}>
                <summary>Agendar atividade</summary>
                <form action={scheduleActivity} className="hub-form-grid">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <label><span>Tipo</span><select name="tipo" defaultValue="ligacao">{ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}</select></label>
                  <label><span>Título</span><input name="titulo" required minLength={2} maxLength={120} placeholder="Ex.: Demonstração online" /></label>
                  <label><span>Data</span><input type="date" name="data" required min={hoje} defaultValue={hoje} /></label>
                  <label><span>Hora</span><input type="time" name="hora" required defaultValue="10:00" /></label>
                  {papel === 'gestor' && (
                    <label className="hub-span2"><span>Responsável</span>
                      <select name="responsavel" defaultValue={lead.owner_id ?? me}>{ativos.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}</select>
                    </label>
                  )}
                  <div className="hub-span2"><button type="submit" className="hub-btn">Agendar</button></div>
                </form>
              </details>
            )}
            {feitas.length > 0 && (
              <details><summary>Realizadas ({feitas.length})</summary>
                <ul className="hub-acts">{feitas.map((a) => <li key={a.id}><div><strong>{ACTIVITY_LABEL[a.tipo]}</strong> · {a.cancelada_em ? 'cancelada' : 'concluída'} {formatDate(a.concluida_em ?? a.cancelada_em ?? a.agendada_para)}<br />{a.titulo} — {a.resultado}</div></li>)}</ul>
              </details>
            )}
          </section>

          <section className="hub-panel" aria-labelledby="h-prop">
            <h2 id="h-prop">Propostas</h2>
            <ul className="hub-acts">
              {proposals.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>v{p.versao}</strong> <span className={`hub-pstatus hub-pstatus--${p.status}`}>{PROPOSAL_LABEL[p.status]}</span>
                    {' · '}{formatBRL(p.valor_mensal_centavos)}/mês · válida até {formatDay(p.validade)}
                    <br /><small>{p.plano_codigo ? `Plano ${p.plano_codigo}${p.addons.length ? ` + ${p.addons.join(', ')}` : ''}${p.qtd_lojas ? ` · ${p.qtd_lojas} loja(s) / ${p.qtd_caixas} caixa(s)` : ''}` : 'Sem plano do catálogo (valor negociado)'}
                      {p.valor_tabela_centavos !== null && ` · tabela ${formatBRL(p.valor_tabela_centavos)}`}</small>
                    {p.preco_tabela_provisorio && <><br /><small className="hub-alert">Preço de tabela marcado como provisório no catálogo oficial — confirmar antes de enviar.</small></>}
                    {p.condicoes && <><br /><small>{p.condicoes}</small></>}
                    {p.motivo && <><br /><small>Motivo: {p.motivo}</small></>}
                  </div>
                  {PROPOSAL_NEXT[p.status].length > 0 && (
                    <form action={setProposalStatus} className="hub-form-row">
                      <input type="hidden" name="id" value={p.id} /><input type="hidden" name="leadId" value={lead.id} />
                      <select name="status" aria-label={`Nova situação da proposta v${p.versao}`}>{PROPOSAL_NEXT[p.status].map((s) => <option key={s} value={s}>{PROPOSAL_LABEL[s]}</option>)}</select>
                      <input name="motivo" placeholder="Motivo (opcional)" maxLength={500} aria-label="Motivo" />
                      <button type="submit" className="hub-btn hub-btn--ghost">Atualizar</button>
                    </form>
                  )}
                </li>
              ))}
              {proposals.length === 0 && <li className="hub-empty">Nenhuma proposta.</li>}
            </ul>
            {aberto && (
              <details open={proposals.length === 0 && ['demonstracao', 'proposta', 'negociacao'].includes(lead.status)}>
                <summary>Nova proposta</summary>
                <form action={createProposal} className="hub-form-grid">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <label><span>Plano (catálogo oficial)</span>
                    <select name="plano" defaultValue=""><option value="">Sem plano — valor negociado</option>
                      {planos.value.filter((p) => p.tipo === 'PLANO').map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}{p.preco_placeholder ? ' (preço provisório)' : ''}</option>)}
                    </select>
                  </label>
                  <fieldset className="hub-fieldset"><legend>Adicionais</legend>
                    {planos.value.filter((p) => p.tipo === 'ADDON').map((p) => <label key={p.codigo} className="hub-choice"><input type="checkbox" name="addons" value={p.codigo} /> {p.nome}</label>)}
                  </fieldset>
                  <label><span>Lojas</span><input name="qtd_lojas" inputMode="numeric" defaultValue={lead.unidades ?? 1} /></label>
                  <label><span>Caixas</span><input name="qtd_caixas" inputMode="numeric" defaultValue={lead.unidades ?? 1} /></label>
                  <label><span>Valor mensal negociado (R$)</span><input name="valor" inputMode="decimal" placeholder="Vazio = valor de tabela" /></label>
                  <label><span>Validade</span><input type="date" name="validade" required min={hoje} /></label>
                  <label className="hub-span2"><span>Condições</span><textarea name="condicoes" maxLength={2000} rows={2} /></label>
                  <p className="hub-help hub-span2">O valor de tabela é calculado pelo banco a partir de <code>saas.planos</code>. O hub não inventa preços; descontos ficam registrados como valor negociado.</p>
                  <div className="hub-span2"><button type="submit" className="hub-btn">Criar rascunho</button></div>
                </form>
              </details>
            )}
            {papel === 'gestor' && aberto && !trial && convertiveis.length > 0 && (
              <form action={convertLead} className="hub-conv hub-mt">
                <h3>Converter em cliente</h3>
                <input type="hidden" name="leadId" value={lead.id} />
                <label><span>Proposta aceita</span>
                  <select name="propostaId">{convertiveis.map((p) => <option key={p.id} value={p.id}>v{p.versao} · {formatBRL(p.valor_mensal_centavos)}/mês</option>)}</select>
                </label>
                <label><span>Como foi o aceite (obrigatório)</span><textarea name="observacao" required minLength={5} maxLength={1000} rows={2} /></label>
                <label className="hub-choice"><input type="checkbox" name="confirmo" required /> Confirmo que o cliente aceitou. Nenhuma cobrança será criada automaticamente.</label>
                <button type="submit" className="hub-btn">Converter em cliente</button>
              </form>
            )}
          </section>

          <section className="hub-panel" aria-labelledby="h-hist">
            <h2 id="h-hist">Histórico de interações</h2>
            <form action={addEvent} className="hub-note">
              <input type="hidden" name="leadId" value={lead.id} />
              <fieldset>
                <legend>Tipo</legend>
                <label><input type="radio" name="kind" value="contato" defaultChecked /> Contato realizado</label>
                <label><input type="radio" name="kind" value="nota" /> Nota</label>
              </fieldset>
              <label><span>Descrição</span><textarea name="body" required minLength={2} maxLength={2000} rows={2} /></label>
              <button type="submit" className="hub-btn">Adicionar ao histórico</button>
            </form>
            <ol className="hub-timeline">
              {events.map((e) => (
                <li key={e.id} className={e.kind === 'conversao' || e.kind === 'solicitacao' ? 'hub-timeline--destaque' : undefined}>
                  <span className="hub-when">{formatDate(e.created_at)} · {EVENT_LABEL[e.kind] ?? e.kind} · {nomeAutor(e.author)}</span>
                  {e.kind === 'status' && e.from_status && e.to_status
                    ? <span>{stageLabel(stages.value, e.from_status)} → {stageLabel(stages.value, e.to_status)}{e.body ? ` · ${e.body}` : ''}</span>
                    : <span>{e.body}</span>}
                </li>
              ))}
              {events.length === 0 && <li>Sem registros ainda.</li>}
            </ol>
          </section>

          {papel === 'gestor' && (
            <details className="hub-panel">
              <summary><strong>Auditoria</strong> ({audit.length})</summary>
              <p className="hub-help">Quem alterou o quê. Campos com dados pessoais aparecem só pelo nome (LGPD).</p>
              <ol className="hub-timeline">
                {audit.map((a) => (
                  <li key={a.id}>
                    <span className="hub-when">{formatDate(a.criado_em)} · {a.acao} · {nomeAutor(a.ator)}</span>
                    <span>{a.campos.join(', ') || '—'}{a.depois && Object.keys(a.depois).length ? ` → ${Object.entries(a.depois).map(([k, v]) => `${k}: ${k === 'owner_id' ? memberName(members.value, v as string | null) : String(v)}`).join('; ')}` : ''}</span>
                  </li>
                ))}
                {audit.length === 0 && <li>Sem registros de auditoria (a auditoria começa com a migration CRM-001).</li>}
              </ol>
            </details>
          )}
        </div>
      </div>
    </Shell>
  )
}
