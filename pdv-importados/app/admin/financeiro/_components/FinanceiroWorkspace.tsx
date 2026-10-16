'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { SectionCard, MetricCard } from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import { ROUTES } from '@/lib/navigation/routes'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { exportFinanceiroCsv } from '../financeiroCsv'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { FinanceiroContas } from './FinanceiroContas'
import { FinanceiroRecebiveis } from './FinanceiroRecebiveis'
import { FinanceiroConciliacao } from './FinanceiroConciliacao'
import { FinanceiroPrimeiroUso } from './FinanceiroPrimeiroUso'
import { FinanceiroAcoesRapidas, type FinanceiroAcaoRapida } from './FinanceiroAcoesRapidas'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'

export type FinanceiroWorkspaceTab = 'resumo' | 'contas' | 'recebiveis' | 'conciliacao' | 'resultado'

function FinanceiroResumo({ data }: { data: FinanceiroPainel }) {
 const negativo = data.fluxo.find(d => d.saldo < 0)
 return <div className="admin-v2-stack">
  <div className="admin-v2-grid-kpi"><MetricCard label="Saldo nas contas" value={formatBRL(data.saldo)} /><MetricCard label="Dinheiro nos PDVs abertos" value={formatBRL(data.saldo_pdv)} />{[7,30,90].map(d => <MetricCard key={d} label={`Saldo previsto em ${d} dias`} value={formatBRL(data.fluxo[d]?.saldo ?? 0)} />)}</div>
  <SectionCard title="Atenção hoje"><ul className="space-y-2 text-small">
   {negativo ? <li className="text-[var(--color-danger-strong)]">Saldo previsto negativo em {negativo.dia}: {formatBRL(negativo.saldo)}.</li> : <li>A projeção não indica falta de saldo nos próximos 90 dias.</li>}
   <li>{data.alertas.sem_previsao} recebível(is) sem taxa ou previsão confirmada.</li><li>{data.alertas.ar_sem_vencimento} título(s) a receber sem vencimento.</li><li>{data.alertas.sem_categoria} despesa(s) sem categoria.</li><li>{data.alertas.caixas_incompletos} fechamento(s) incompleto(s), a conferir em Caixas.</li>
  </ul><div className="mt-3 flex flex-wrap gap-3 text-small">{[['pagar','Organizar pagamentos'],['receber','Organizar recebimentos'],['recebiveis','Conferir cartões e PIX']].map(([tab,label]) => <Link className="underline" key={tab} href={`${ROUTES.admin.financeiro}?tab=${tab}`}>{label}</Link>)}</div></SectionCard>
  <SectionCard title="Fluxo de caixa previsto"><p className="mb-3 text-caption text-jl-fg-3">Parte do saldo atual das contas e PDVs abertos. Vencidos entram em hoje; títulos sem vencimento e recebíveis sem taxa/previsão ficam fora da projeção. Previsto não significa recebido.</p><div className="max-h-96 overflow-auto"><table className="w-full text-small"><thead><tr>{['Data','Entradas previstas','Saídas previstas','Saldo previsto'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{data.fluxo.map(d => <tr key={d.dia} className="border-t border-[var(--color-border-secondary)]"><td className="p-2">{d.dia}</td><td className="p-2">{formatBRL(d.entradas)}</td><td className="p-2">{formatBRL(d.saidas)}</td><td className={`p-2 ${d.saldo<0 ? 'text-[var(--color-danger-strong)]' : ''}`}>{formatBRL(d.saldo)}</td></tr>)}</tbody></table></div></SectionCard>
 </div>
}

function FinanceiroMovimentos({ data }: { data: FinanceiroPainel }) {
 function download() {
  const blob = new Blob(['\uFEFF' + exportFinanceiroCsv(data.movimentos.map(m => ({ data:m.data,conta:m.conta_nome,descricao:m.descricao,categoria:m.categoria_nome,valor:m.valor,origem:m.origem,usuario:m.usuario_nome })))], { type:'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='movimentos-financeiros-pagina.csv'; a.click(); URL.revokeObjectURL(url)
 }
 return <div className="admin-v2-stack"><SectionCard title="Extrato / movimentações realizadas" action={<button className="admin-v2-btn-secondary" onClick={download} disabled={!data.movimentos.length}>Exportar esta página</button>}><div className="overflow-x-auto"><table className="w-full text-small"><thead><tr>{['Data','Conta','Descrição','Usuário','Origem','Categoria','Valor','Conciliação'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{data.movimentos.map(m => <tr key={m.id} className="border-t border-[var(--color-border-secondary)]"><td className="p-2">{m.data}</td><td className="p-2">{m.conta_nome}</td><td className="p-2">{m.descricao}{m.estornado ? ' · estornado' : ''}</td><td className="p-2">{m.usuario_nome ?? '—'}</td><td className="p-2">{m.origem}{m.origem_id ? ` · ${m.origem_id.slice(0,8)}` : ''}</td><td className="p-2">{m.categoria_nome ?? '—'}</td><td className="p-2">{formatBRL(m.valor)}</td><td className="p-2">{m.conciliacao_id ? 'Conciliado' : 'Pendente'}</td></tr>)}</tbody></table></div>{!data.movimentos.length ? <p className="py-3">Sem movimentos neste período e página.</p> : null}</SectionCard>
 <FinanceiroForm title="Estornar movimento avulso" tipo="ESTORNAR_MOVIMENTO"><Field name="movimento_id" label="Movimento"><option value="">Selecione</option>{data.movimentos.filter(m => m.origem==='MANUAL' && !m.estornado).map(m => <option key={m.id} value={m.id}>{m.descricao} · {formatBRL(m.valor)}</option>)}</Field><Field name="data" label="Data do estorno" type="date" value={data.hoje} /><Field name="descricao" label="Motivo" /></FinanceiroForm></div>
}

function FinanceiroResultado({ data }: { data: FinanceiroPainel }) {
 const totals = data.resultado_caixa.reduce((a,r) => ({ entradas:a.entradas+r.entradas,saidas:a.saidas+r.saidas }), { entradas:0,saidas:0 })
 const gerencial=data.resultado_gerencial
 const margem=gerencial.receita_vendas-gerencial.custo_conhecido
 const incompleto=gerencial.itens_sem_custo>0 || gerencial.taxas_pendentes>0
 return <div className="admin-v2-stack">
  <SectionCard title="Resultado gerencial estimado">
   <div className="admin-v2-grid-kpi"><MetricCard label="Vendas líquidas de devoluções" value={formatBRL(gerencial.receita_vendas)} /><MetricCard label="Custo das mercadorias conhecido" value={formatBRL(gerencial.custo_conhecido)} /><MetricCard label="Margem bruta estimada" value={gerencial.itens_sem_custo ? 'Conferir custos' : formatBRL(margem)} /><MetricCard label="Despesas manuais por competência" value={formatBRL(gerencial.despesas_manuais)} /><MetricCard label="Taxas conferidas" value={formatBRL(gerencial.taxas_conferidas)} /><MetricCard label="Resultado operacional estimado" value={incompleto ? 'Dados incompletos' : formatBRL(margem-gerencial.despesas_manuais-gerencial.taxas_conferidas)} /></div>
   <p className="mt-3 text-small text-jl-fg-3">Considera as vendas concluídas do período, seu custo registrado na venda e as devoluções conhecidas hoje. Despesas manuais entram pela competência; compras por NF-e ficam fora para evitar descontar estoque e custo da mercadoria duas vezes. Não inclui impostos, depreciação ou despesas ainda não cadastradas. Movimentos avulsos aparecem no resultado de caixa abaixo.</p>
   {incompleto ? <p role="status" className="mt-2 text-small">{gerencial.itens_sem_custo} item(ns) sem custo histórico e {gerencial.taxas_pendentes} taxa(s) ainda não conferida(s). Complete os dados antes de interpretar o resultado.</p> : null}
  </SectionCard>
  <div className="admin-v2-grid-kpi"><MetricCard label="Entradas realizadas nas contas" value={formatBRL(totals.entradas)} /><MetricCard label="Saídas realizadas nas contas" value={formatBRL(totals.saidas)} /><MetricCard label="Resultado de caixa nas contas" value={formatBRL(totals.entradas-totals.saidas)} /></div>
  <SectionCard title="Resultado realizado por categoria"><p className="mb-3 text-small text-jl-fg-3">Regime de caixa das contas financeiras no período: exclui saldo inicial e transferências. Vendas em espécie continuam nos relatórios do PDV. Este valor não é lucro contábil nem substitui a margem das vendas.</p><table className="w-full text-small"><thead><tr>{['Categoria','Entradas','Saídas','Resultado'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{data.resultado_caixa.map(r => <tr key={r.categoria}><td className="p-2">{r.categoria}</td><td className="p-2">{formatBRL(r.entradas)}</td><td className="p-2">{formatBRL(r.saidas)}</td><td className="p-2">{formatBRL(r.resultado)}</td></tr>)}</tbody></table><Link className="mt-3 block text-small underline" href={`${ROUTES.admin.relatorios}?view=dre-financeiro`}>Ver faturamento e margem estimada de vendas</Link></SectionCard>
 </div>
}

export function FinanceiroPeriodo({ de, ate }: { de:string; ate:string }) {
 const router = useRouter(); const search = useSearchParams()
 return <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const fd=new FormData(e.currentTarget); const p=new URLSearchParams(search.toString()); p.set('de',String(fd.get('de')));p.set('ate',String(fd.get('ate')));p.delete('pagina');router.push(`${ROUTES.admin.financeiro}?${p}`) }}><Field name="de" label="De" type="date" value={de} /><Field name="ate" label="Até" type="date" value={ate} /><button className="admin-v2-btn-secondary">Aplicar período</button></form>
}

export function FinanceiroPaginacao({ data, countKey }: { data:FinanceiroPainel; countKey:keyof FinanceiroPainel['contagens'] }) {
 const router = useRouter(); const search=useSearchParams(); const total=data.contagens[countKey]; const pages=Math.max(1,Math.ceil(total/50))
 function go(pagina:number) {const p=new URLSearchParams(search.toString());p.set('pagina',String(pagina));router.push(`${ROUTES.admin.financeiro}?${p}`)}
 return <div className="my-4 flex items-center gap-3 text-small"><button className="admin-v2-btn-secondary" disabled={data.pagina<=1} onClick={() => go(data.pagina-1)}>Anterior</button><span>Página {data.pagina} de {pages} · {total} registros</span><button className="admin-v2-btn-secondary" disabled={data.pagina>=pages} onClick={() => go(data.pagina+1)}>Próxima</button></div>
}

export function FinanceiroWorkspace({ data, tab, de, ate }: { data:FinanceiroPainel; tab:FinanceiroWorkspaceTab; de:string; ate:string }) {
 const [acao, setAcao] = useState<FinanceiroAcaoRapida>(null)
 const { idioma } = useAdminV2Session()
 const ui = getMessages(idioma).admin_ui
 const contasLabels = {
  saldosTitulo: ui.financeiro_contas_saldos_titulo,
  saldoRegistrado: ui.financeiro_saldo_registrado,
  saldoRegistradoHint: ui.financeiro_saldo_registrado_hint,
  tipoBanco: ui.financeiro_tipo_banco,
  tipoCaixa: ui.financeiro_tipo_caixa,
  inativa: ui.financeiro_conta_inativa,
  entradasPeriodo: ui.financeiro_entradas_periodo,
  saidasPeriodo: ui.financeiro_saidas_periodo,
  verExtrato: ui.financeiro_ver_extrato,
  extratoTitulo: ui.financeiro_extrato_titulo,
  colData: ui.financeiro_col_data,
  colDesc: ui.financeiro_col_descricao,
  colValor: ui.financeiro_col_valor,
  colOrigem: ui.financeiro_col_origem,
  colUsuario: ui.financeiro_col_usuario,
  cadastrarTitulo: ui.financeiro_cadastrar_conta,
  nomeConta: ui.financeiro_nome_conta,
  tipoConta: ui.financeiro_tipo_conta,
  dataInicial: ui.financeiro_data_inicial,
  saldoInicial: ui.financeiro_saldo_inicial,
  vincularPdv: ui.financeiro_vincular_pdv,
  vincularPdvHint: ui.financeiro_vincular_pdv_hint,
  movimentoAvulso: ui.financeiro_movimento_avulso,
  movimentoAvulsoHint: ui.financeiro_movimento_avulso_hint,
  formasTitulo: ui.financeiro_formas_titulo,
  formasHint: ui.financeiro_formas_hint,
  formaCodigo: ui.financeiro_forma_codigo,
  formaConta: ui.financeiro_forma_conta,
  formaSemConta: ui.financeiro_forma_sem_conta,
  salvarVinculo: ui.financeiro_salvar_vinculo,
  inativar: ui.financeiro_inativar_conta,
  inativarConfirm: ui.financeiro_inativar_confirm,
  origemDoc: ui.financeiro_origem_doc,
  semMovimentos: ui.financeiro_sem_movimentos,
 }
 const acoesLabels = {
  faixaAria: ui.financeiro_acoes_aria,
  registrarVenda: ui.financeiro_acao_registrar_venda,
  receber: ui.financeiro_acao_receber,
  pagar: ui.financeiro_acao_pagar,
  transferir: ui.financeiro_acao_transferir,
  vendaTitulo: ui.financeiro_acao_venda_titulo,
  vendaTexto: ui.financeiro_acao_venda_texto,
  vendaPdv: ui.financeiro_acao_venda_pdv,
  vendaBuscar: ui.financeiro_acao_venda_buscar,
  receberTitulo: ui.financeiro_acao_receber_titulo,
  pagarTitulo: ui.financeiro_acao_pagar_titulo,
  transferirTitulo: ui.financeiro_acao_transferir_titulo,
  avulsoHint: ui.financeiro_acao_avulso_hint,
  confirmarReceber: ui.financeiro_acao_confirmar_receber,
  confirmarPagar: ui.financeiro_acao_confirmar_pagar,
  confirmarTransferir: ui.financeiro_acao_confirmar_transferir,
 }
 return <div className="admin-v2-stack">
  <FinanceiroPeriodo de={de} ate={ate} />
  {(tab==='resumo' || tab==='contas') ? <FinanceiroPrimeiroUso semContas={data.contas.length === 0} /> : null}
  {tab==='resumo' ? <FinanceiroResumo data={data} /> : null}
  {tab==='contas' ? <>
    <FinanceiroAcoesRapidas data={data} labels={acoesLabels} mostrar={['transferir']} acao={acao} onAcao={setAcao} />
    <FinanceiroContas data={data} labels={contasLabels} />
    <FinanceiroMovimentos data={data} />
    <FinanceiroPaginacao data={data} countKey="movimentos" />
  </> : null}
  {tab==='recebiveis' ? <><FinanceiroRecebiveis data={data} /><FinanceiroPaginacao data={data} countKey="recebiveis" /></> : null}
  {tab==='conciliacao' ? <><FinanceiroConciliacao data={data} /><FinanceiroPaginacao data={data} countKey="extratos" /></> : null}
  {tab==='resultado' ? <FinanceiroResultado data={data} /> : null}
 </div>
}
