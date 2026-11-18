import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/session'
import {
  ASSINATURA_LABEL, convertivel, diasRestantes, fase, FASE_LABEL, FORMA_LABEL, FORMAS, formatBRL, INTERESSE_LABEL, INTERESSES,
  prioridade, PRIORIDADE_LABEL, valorTabela,
} from '@/lib/conversao'
import { CHANNEL_LABEL, EVENT_LABEL, formatDate, isUuid, STATUS_LABEL, STATUSES } from '@/lib/model'
import { tentar } from '@/lib/seguro'
import { Shell, StatusBadge } from '../../Shell'
import { converter, criarFicha, mudarEtapa, registrarContato, salvarAcompanhamento } from '../actions'

export const dynamic = 'force-dynamic'

const nunca = (iso: string | null) => (iso ? formatDate(iso) : 'nunca')

export default async function TrialPage({ params, searchParams }: {
  params: Promise<{ empresaId: string }>
  searchParams: Promise<{ msg?: string; erro?: string }>
}) {
  const { empresaId } = await params
  const { msg, erro } = await searchParams
  if (!isUuid(empresaId)) notFound()
  const { repo, demo } = await requireAdmin()
  const [dataR, planosR] = await Promise.all([
    tentar('trial:getTrial', () => repo.getTrial(empresaId), null),
    tentar('trial:listPlanos', () => repo.listPlanos(), []),
  ])
  if (dataR.falhou) {
    return (
      <Shell demo={demo} active="conversao">
        <p><Link href="/conversao" className="hub-link">← Central de Conversão</Link></p>
        <p className="hub-error" role="alert">Não foi possível carregar este teste grátis agora. Tente de novo em instantes.</p>
      </Shell>
    )
  }
  const data = dataR.value
  if (!data) notFound()
  const planos = planosR.value
  const { trial: t, events } = data
  const l = t.lead
  const a = t.atividade
  const f = fase(t)
  const dias = diasRestantes(t)
  const score = prioridade(t)
  const podeConverter = convertivel(t)
  const planosBase = planos.filter((p) => p.tipo === 'PLANO')
  const addons = planos.filter((p) => p.tipo === 'ADDON')
  const placeholder = planos.some((p) => p.preco_placeholder)
  const planoSugerido = planosBase.find((p) => p.codigo === t.plano_codigo)?.codigo ?? planosBase[0]?.codigo

  return (
    <Shell demo={demo} active="conversao">
      <p><Link href="/conversao" className="hub-link">← Central de Conversão</Link></p>
      <h1>{t.empresa_nome}</h1>
      {msg && <p className="hub-msg" role="status">{msg.slice(0, 160)}</p>}
      {erro && <p className="hub-error" role="alert">{erro.slice(0, 160)}</p>}
      {planosR.falhou && <p className="hub-error" role="alert">Lista de planos indisponível: a conversão fica desativada até ela voltar.</p>}
      {t.solicitou_contratacao_em && f !== 'cliente' && (
        <p className="hub-error" role="note"><strong>O cliente pediu para contratar</strong> em {formatDate(t.solicitou_contratacao_em)}. Entre em contato e, se aprovar, faça a conversão abaixo.</p>
      )}

      <div className="hub-grid2">
        <section className="hub-panel" aria-labelledby="h-cad">
          <h2 id="h-cad">Cadastro</h2>
          {l ? (
            <dl className="hub-dl">
              <dt>Responsável</dt><dd>{l.name}</dd>
              <dt>Contato</dt><dd>{CHANNEL_LABEL[l.channel]}: {l.contact}</dd>
              {l.email && l.channel !== 'email' && (<><dt>E-mail</dt><dd>{l.email}</dd></>)}
              <dt>Idioma</dt><dd>{l.locale === 'zh-CN' ? 'Chinês' : 'Português'}</dd>
              <dt>Protocolo</dt><dd><code>{l.protocol}</code> · <Link href={`/leads/${l.id}`}>ver no funil de leads</Link></dd>
            </dl>
          ) : (
            <form action={criarFicha}>
              <p className="hub-help">Este teste ainda não tem ficha comercial (o cadastro não conseguiu criá-la).</p>
              <input type="hidden" name="empresaId" value={t.empresa_id} />
              <button type="submit" className="hub-btn">Criar ficha comercial</button>
            </form>
          )}
          <p className="hub-help">Dados pessoais de uso restrito ao comercial (LGPD): usar só para falar sobre o teste e a contratação.</p>
        </section>

        <section className="hub-panel" aria-labelledby="h-aval">
          <h2 id="h-aval">Período de avaliação</h2>
          <dl className="hub-dl">
            <dt>Situação</dt><dd><strong>{FASE_LABEL[f]}</strong> · {ASSINATURA_LABEL[t.status] ?? t.status}</dd>
            <dt>Início</dt><dd>{formatDate(t.criado_em)}</dd>
            <dt>Fim do teste</dt><dd>{formatDate(t.trial_fim)}{f === 'em_teste' || f === 'expira_logo' ? ` (${Math.max(dias, 0)} dia(s))` : ''}</dd>
            <dt>Plano</dt><dd>{t.plano_codigo}{t.addons.length ? ` + ${t.addons.join('+')}` : ''}{t.valor_mensal_centavos !== null ? ` · ${formatBRL(t.valor_mensal_centavos)}/mês` : ''}</dd>
            {score.nivel && (<><dt>Prioridade</dt><dd><span className={`hub-prio hub-prio--${score.nivel}`}>{PRIORIDADE_LABEL[score.nivel]}</span> <small>({score.motivos.join(' · ') || 'sem sinais ainda'})</small></dd></>)}
          </dl>
          <h2>Uso do sistema</h2>
          <dl className="hub-dl">
            <dt>Último acesso</dt><dd>{nunca(a.ultimo_acesso)}</dd>
            <dt>Vendas</dt><dd>{a.vendas_total} no total · {a.vendas_7d} em 7 dias · última {nunca(a.ultima_venda)}</dd>
            <dt>Produtos</dt><dd>{a.produtos_proprios} cadastrados pelo cliente (sem contar os de demonstração)</dd>
            <dt>Estrutura</dt><dd>{a.lojas_ativas} loja(s) · {a.usuarios_ativos} usuário(s) · {a.caixas_abertos} caixa(s) aberto(s)</dd>
          </dl>
          <p className="hub-help">Somente contagens: valores de venda e dados dos clientes da loja não são exibidos.</p>
        </section>
      </div>

      {l && (
        <div className="hub-grid2 hub-mt">
          <section className="hub-panel" aria-labelledby="h-acomp">
            <h2 id="h-acomp">Acompanhamento</h2>
            <form action={salvarAcompanhamento} className="hub-form-row">
              <input type="hidden" name="empresaId" value={t.empresa_id} />
              <input type="hidden" name="leadId" value={l.id} />
              <label>
                <span>Interesse comercial</span>
                <select name="interesse" defaultValue={l.interesse ?? ''}>
                  <option value="">Não avaliado</option>
                  {INTERESSES.map((i) => <option key={i} value={i}>{INTERESSE_LABEL[i]}</option>)}
                </select>
              </label>
              <label>
                <span>Próximo contato</span>
                <input type="date" name="proximo_contato" defaultValue={l.proximo_contato ?? ''} />
              </label>
              <button type="submit" className="hub-btn">Salvar</button>
            </form>
            <form action={mudarEtapa} className="hub-form-row hub-mt">
              <input type="hidden" name="empresaId" value={t.empresa_id} />
              <input type="hidden" name="leadId" value={l.id} />
              <label>
                <span>Etapa do funil</span>
                <select name="status" defaultValue={l.status}>
                  {STATUSES.filter((s) => s !== 'contratado' || l.status === 'contratado').map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </label>
              <button type="submit" className="hub-btn">Mudar etapa</button>
            </form>
            <p className="hub-help">“Contratado” só pela conversão abaixo, que ajusta plano e assinatura.</p>
          </section>

          <section className="hub-panel" aria-labelledby="h-hist">
            <h2 id="h-hist">Contatos e histórico</h2>
            <form action={registrarContato} className="hub-note">
              <input type="hidden" name="empresaId" value={t.empresa_id} />
              <input type="hidden" name="leadId" value={l.id} />
              <fieldset>
                <legend>Tipo</legend>
                <label><input type="radio" name="kind" value="contato" defaultChecked /> Contato realizado</label>
                <label><input type="radio" name="kind" value="nota" /> Nota</label>
              </fieldset>
              <label>
                <span>O que foi conversado</span>
                <textarea name="body" required minLength={2} maxLength={2000} rows={3} />
              </label>
              <button type="submit" className="hub-btn">Registrar</button>
            </form>
            <ol className="hub-timeline">
              {events.map((e) => (
                <li key={e.id} className={e.kind === 'solicitacao' || e.kind === 'conversao' ? 'hub-timeline--destaque' : undefined}>
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
      )}

      <section className="hub-panel hub-mt" aria-labelledby="h-conv">
        <h2 id="h-conv">Converter em cliente pagante</h2>
        {f === 'cliente' ? (
          <p>Esta empresa já é cliente pagante{t.motivo_status === 'CONVERSAO_MANUAL' ? ' (conversão manual)' : ''}. Ajustes de plano: em <Link href="/clientes">Lojas contratadas</Link> e na assinatura.</p>
        ) : !podeConverter ? (
          <p className="hub-help">
            {t.tem_cobranca_asaas
              ? 'O cliente já tem assinatura no Asaas: trate pela cobrança para não cobrar em dobro.'
              : 'A assinatura não está em teste nem com teste expirado: conversão indisponível.'}
          </p>
        ) : (
          <form action={converter} className="hub-conv">
            <input type="hidden" name="empresaId" value={t.empresa_id} />
            <p className="hub-help">
              Use depois de combinar com o cliente. A conversão libera o plano escolhido, reativa as vendas se o teste já tiver expirado e registra tudo na auditoria.
              <strong> Não gera cobrança, boleto nem Pix automático.</strong>
            </p>
            {placeholder && <p className="hub-error" role="note">Atenção: os preços de tabela ainda estão marcados como provisórios. Confira o valor antes de confirmar.</p>}
            <fieldset className="hub-fieldset">
              <legend>Plano</legend>
              {planosBase.map((p) => (
                <label key={p.codigo} className="hub-choice">
                  <input type="radio" name="plano" value={p.codigo} defaultChecked={p.codigo === planoSugerido} required />
                  <span><strong>{p.nome}</strong> · {formatBRL(p.preco_loja_centavos)}/loja{p.max_lojas ? ` · até ${p.max_lojas} loja(s)` : ' · lojas ilimitadas'}</span>
                </label>
              ))}
              {addons.map((p) => (
                <label key={p.codigo} className="hub-choice">
                  <input type="checkbox" name="addons" value={p.codigo} defaultChecked={t.addons.includes(p.codigo)} />
                  <span>Add-on <strong>{p.nome}</strong> · {formatBRL(p.preco_loja_centavos)}/loja</span>
                </label>
              ))}
            </fieldset>
            <div className="hub-form-row">
              <label><span>Lojas</span><input type="number" name="qtdLojas" min={Math.max(1, a.lojas_ativas)} max={200} defaultValue={Math.max(t.qtd_lojas, a.lojas_ativas, 1)} required /></label>
              <label><span>Caixas (total)</span><input type="number" name="qtdCaixas" min={1} max={1000} defaultValue={Math.max(t.qtd_caixas, 1)} required /></label>
              <label>
                <span>Forma de pagamento combinada</span>
                <select name="forma" defaultValue="UNDEFINED">
                  {FORMAS.map((x) => <option key={x} value={x}>{FORMA_LABEL[x]}</option>)}
                </select>
              </label>
              <label>
                <span>Valor mensal negociado (R$)</span>
                <input name="valor" inputMode="decimal" placeholder={`Tabela: ${formatBRL(valorTabela(planos, planoSugerido ?? '', [], t.qtd_lojas, t.qtd_caixas) ?? 0)}`} maxLength={12} />
              </label>
            </div>
            <p className="hub-help">Deixe o valor em branco para usar a tabela do plano (calculada pelo banco com lojas, caixas e add-ons).</p>
            <label className="hub-block">
              <span>Condições aprovadas (obrigatório)</span>
              <textarea name="observacao" required minLength={5} maxLength={1000} rows={3} placeholder="Ex.: aprovado por mim em ligação de 23/10; 1º pagamento por Pix no dia 5." />
            </label>
            <label className="hub-choice">
              <input type="checkbox" name="confirmo" value="sim" required />
              <span>Confirmo que aprovei pessoalmente esta contratação.</span>
            </label>
            <button type="submit" className="hub-btn">Converter em cliente pagante</button>
          </form>
        )}
      </section>
    </Shell>
  )
}
