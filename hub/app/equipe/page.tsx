import Link from 'next/link'
import { requireGestor } from '@/lib/session'
import { tentar } from '@/lib/seguro'
import { formatDate } from '@/lib/model'
import { DEFAULT_STAGES, memberName, sortedStages } from '@/lib/crm'
import { Flash, Shell } from '../Shell'
import { saveMember, saveStage } from './actions'

export const dynamic = 'force-dynamic'

const TABELA: Record<string, string> = {
  commercial_leads: 'Lead', commercial_customers: 'Cliente', commercial_proposals: 'Proposta', commercial_activities: 'Atividade',
  commercial_stages: 'Etapa', commercial_admins: 'Equipe',
}

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ msg?: string; erro?: string }> }) {
  const { repo, demo, papel } = await requireGestor()
  const { msg, erro } = await searchParams
  const [members, stages, audit] = await Promise.all([
    tentar('equipe:listMembers', () => repo.listMembers(), []),
    tentar('equipe:listStages', () => repo.listStages(), DEFAULT_STAGES),
    tentar('equipe:listAudit', () => repo.listAudit(40), []),
  ])
  return (
    <Shell demo={demo} active="equipe" papel={papel}>
      <h1>Equipe, etapas e auditoria</h1>
      <Flash msg={msg} erro={erro} />
      {(members.falhou || stages.falhou) && <p className="hub-error" role="alert">Parte dos dados não carregou. A migration CRM-001 já foi aplicada?</p>}
      <div className="hub-grid2">
        <section className="hub-panel" aria-labelledby="h-eq">
          <h2 id="h-eq">Equipe comercial</h2>
          <p className="hub-help"><strong>Gestor</strong>: vê tudo, converte clientes, gerencia equipe e etapas. <strong>Vendedor</strong>: vê e trabalha só os leads dele e os sem responsável.</p>
          <div className="hub-table-wrap">
            <table className="hub-table hub-table--compact">
              <thead><tr><th scope="col">Nome</th><th scope="col">Papel</th><th scope="col">Situação</th><th scope="col">Alterar</th></tr></thead>
              <tbody>
                {members.value.map((m) => (
                  <tr key={m.user_id}>
                    <td data-label="Nome"><strong>{m.nome}</strong><br /><small>{m.email}</small></td>
                    <td data-label="Papel">{m.papel === 'gestor' ? 'Gestor' : 'Vendedor'}</td>
                    <td data-label="Situação">{m.ativo ? 'Ativo' : 'Inativo'}</td>
                    <td data-label="Alterar">
                      {m.email && (
                        <form action={saveMember} className="hub-form-row">
                          <input type="hidden" name="email" value={m.email} /><input type="hidden" name="nome" value={m.nome} />
                          <select name="papel" defaultValue={m.papel} aria-label={`Papel de ${m.nome}`}><option value="vendedor">Vendedor</option><option value="gestor">Gestor</option></select>
                          <select name="ativo" defaultValue={m.ativo ? '1' : '0'} aria-label={`Situação de ${m.nome}`}><option value="1">Ativo</option><option value="0">Inativo</option></select>
                          <button type="submit" className="hub-btn hub-btn--ghost">Salvar</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={saveMember} className="hub-form-grid hub-mt">
            <h3 className="hub-span2">Adicionar à equipe</h3>
            <label><span>E-mail da conta</span><input type="email" name="email" required maxLength={254} /></label>
            <label><span>Nome</span><input name="nome" minLength={2} maxLength={80} /></label>
            <label><span>Papel</span><select name="papel" defaultValue="vendedor"><option value="vendedor">Vendedor</option><option value="gestor">Gestor</option></select></label>
            <div><button type="submit" className="hub-btn">Adicionar</button></div>
            <p className="hub-help hub-span2">A conta precisa existir no Supabase Auth (criação e senha ficam fora do hub). Desativar tira o acesso na hora; leads do membro continuam com ele até serem reatribuídos.</p>
          </form>
        </section>

        <section className="hub-panel" aria-labelledby="h-et">
          <h2 id="h-et">Etapas do pipeline</h2>
          <p className="hub-help">Etapas de trabalho podem ser renomeadas, reordenadas (11 a 89), criadas e desativadas (se vazias). As do sistema só mudam de nome.</p>
          <ul className="hub-acts">
            {sortedStages(stages.value).map((s) => (
              <li key={s.codigo}>
                <form action={saveStage} className="hub-form-row">
                  <input type="hidden" name="codigo" value={s.codigo} />
                  <label><span>Nome{s.sistema ? ' (sistema)' : ''}</span><input name="rotulo" defaultValue={s.rotulo} required minLength={2} maxLength={40} /></label>
                  <label className="hub-narrow"><span>Ordem</span><input name="ordem" type="number" defaultValue={s.ordem} readOnly={s.sistema} min={0} max={100} /></label>
                  {!s.sistema && (
                    <label className="hub-narrow"><span>Ativa</span><select name="ativo" defaultValue={s.ativo ? '1' : '0'}><option value="1">Sim</option><option value="0">Não</option></select></label>
                  )}
                  <button type="submit" className="hub-btn hub-btn--ghost">Salvar</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveStage} className="hub-form-row hub-mt">
            <label><span>Nova etapa</span><input name="rotulo" required minLength={2} maxLength={40} placeholder="Ex.: Visita técnica" /></label>
            <label className="hub-narrow"><span>Ordem</span><input name="ordem" type="number" required min={11} max={89} defaultValue={45} /></label>
            <button type="submit" className="hub-btn">Criar</button>
          </form>
        </section>
      </div>

      <section className="hub-panel hub-mt" aria-labelledby="h-aud">
        <h2 id="h-aud">Auditoria recente</h2>
        <p className="hub-help">Registro automático (append-only) de toda alteração em leads, propostas, atividades, clientes, etapas e equipe. Dados pessoais aparecem só pelo nome do campo.</p>
        <div className="hub-table-wrap">
          <table className="hub-table hub-table--compact">
            <thead><tr><th scope="col">Quando</th><th scope="col">Quem</th><th scope="col">O quê</th><th scope="col">Campos</th></tr></thead>
            <tbody>
              {audit.value.map((a) => (
                <tr key={a.id}>
                  <td data-label="Quando">{formatDate(a.criado_em)}</td>
                  <td data-label="Quem">{a.ator ? memberName(members.value, a.ator) : 'Sistema / site'}</td>
                  <td data-label="O quê">{TABELA[a.tabela] ?? a.tabela} · {a.acao === 'INSERT' ? 'criação' : a.acao === 'UPDATE' ? 'alteração' : 'exclusão'}
                    {a.tabela === 'commercial_leads' && <> · <Link href={`/leads/${a.registro}`}>abrir</Link></>}</td>
                  <td data-label="Campos">{a.campos.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {audit.value.length === 0 && <p className="hub-empty">Sem registros.</p>}
        </div>
      </section>
    </Shell>
  )
}
