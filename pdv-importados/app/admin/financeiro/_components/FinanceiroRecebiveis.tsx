'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { adminVendaDetalheQuery } from '@/lib/navigation/routes'
import { formatBRL } from '@/lib/format/money'
import { MetricCard, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusChip } from '@/components/ui/StatusChip'
import { EmptyState, ErrorState, Loading } from '@/components/ui/feedback'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatarDataCivilNumerica } from '@/lib/relatorios/periodoRelatorio'
import type { FinanceiroRecebivel } from '../financeiroLojaTypes'
import { carregarRecebiveisCompletos } from '../financeiroLojaActions'
import { exportFinanceiroCsv } from '../financeiroCsv'
import { linhasCsvRecebiveis, resumirRecebiveis, statusExibicaoRecebivel, STATUS_CHIP_RECEBIVEL, type RecebivelStatusExibicao, type ResumoRecebiveis } from '../recebiveisResumo'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { ContaOptions } from './FinanceiroOptions'

export function FinanceiroRecebiveis({ data }: { data: FinanceiroPainel }) {
 const pendentes = data.recebiveis.filter(r => r.status === 'PENDENTE')
 return <div className="admin-v2-stack">
  <SectionCard title="Agenda de PIX e cartões">
   <p className="mb-3 text-small text-jl-fg-3">Novas vendas geram recebíveis automaticamente, incluindo pagamentos mistos. Taxa e previsão precisam ser conferidas. Histórico anterior à atualização permanece em Vendas.</p>
   <FinanceiroRecebiveisTabela data={data} />
  </SectionCard>
  <FinanceiroForm title="Conferir recebível" tipo="CONFIGURAR_RECEBIVEL">
   <Field name="recebivel_id" label="Recebível pendente"><option value="">Selecione</option>{pendentes.map(r => <option key={r.id} value={r.id}>{r.venda_id.slice(0,8)} · {r.forma} · {formatBRL(r.bruto)}</option>)}</Field>
   <Field name="conta_id" label="Conta de depósito"><ContaOptions data={data} /></Field>
   <Field name="taxa" label="Taxa total (R$), inclusive zero" type="number" value={0} />
   <Field name="data" label="Previsão de depósito" type="date" />
   <Field name="parcelas" label="Parcelas mensais (1 a 60)" type="number" value={1} />
   <Field name="operadora" label="Operadora / banco" required={false} />
   <p className="text-caption sm:col-span-2">O parcelamento divide bruto e taxa, preservando os centavos. Cada parcela tem seu depósito e pode ser conferida individualmente. Reembolsos pelo meio eletrônico compensam a conta vinculada; dinheiro devolvido permanece no PDV.</p>
  </FinanceiroForm>
  <FinanceiroForm title="Registrar depósito recebido" tipo="RECEBER_VENDA" submit="Registrar recebimento">
   <Field name="recebivel_id" label="Recebível conferido"><option value="">Selecione</option>{pendentes.filter(r => r.taxa !== null && r.conta_financeira_id).map(r => <option key={r.id} value={r.id}>{r.venda_id.slice(0,8)} · {formatBRL(r.liquido)}</option>)}</Field>
   <Field name="data" label="Data efetiva do depósito" type="date" value={data.hoje} />
  </FinanceiroForm>
  <FinanceiroForm title="Corrigir registro de depósito" tipo="ESTORNAR_RECEBIVEL" submit="Estornar registro">
   <Field name="recebivel_id" label="Depósito recebido"><option value="">Selecione</option>{data.recebiveis.filter(r => r.status==='RECEBIDO').map(r => <option key={r.id} value={r.id}>{r.venda_id.slice(0,8)} · parcela {r.parcela}/{r.parcelas} · {formatBRL(r.liquido)}</option>)}</Field>
   <Field name="data" label="Data da correção" type="date" value={data.hoje} />
   <Field name="descricao" label="Motivo" />
   <p className="text-caption sm:col-span-2">Use para corrigir um registro lançado por engano. O recebível volta a ficar pendente e o histórico do depósito é preservado. Devoluções de mercadoria seguem o pós-venda.</p>
  </FinanceiroForm>
 </div>
}

type ResumoEstado = { estado: 'carregando' } | { estado: 'erro'; msg: string } | { estado: 'ok'; resumo: ResumoRecebiveis; truncado: boolean; n: number }

function FinanceiroRecebiveisTabela({ data }: { data: FinanceiroPainel }) {
 const { idioma } = useAdminV2Session()
 const ui = getMessages(idioma).admin_ui
 const locale = localeFromIdioma(idioma)
 const rotuloStatus: Record<RecebivelStatusExibicao, string> = {
  pendente: ui.financeiro_receb_status_pendente,
  vencido: ui.financeiro_receb_status_vencido,
  recebido: ui.financeiro_receb_status_recebido,
  cancelado: ui.financeiro_receb_status_cancelado,
 }
 const [resumo, setResumo] = useState<ResumoEstado>({ estado: 'carregando' })
 const [tentativa, setTentativa] = useState(0)
 const [exportando, setExportando] = useState(false)
 const [erroExport, setErroExport] = useState<string | null>(null)

 useEffect(() => {
  let ativo = true
  setResumo({ estado: 'carregando' })
  carregarRecebiveisCompletos().then(res => {
   if (!ativo) return
   if (!res.ok) { setResumo({ estado: 'erro', msg: res.error }); return }
   setResumo({ estado: 'ok', resumo: resumirRecebiveis(res.data.rows, res.data.hoje), truncado: res.data.truncado, n: res.data.rows.length })
  }).catch(() => { if (ativo) setResumo({ estado: 'erro', msg: ui.financeiro_receb_resumo_erro }) })
  return () => { ativo = false }
 }, [tentativa, ui.financeiro_receb_resumo_erro])

 const exportar = useCallback(async () => {
  setExportando(true); setErroExport(null)
  try {
   const res = await carregarRecebiveisCompletos()
   if (!res.ok) { setErroExport(res.error); return }
   const csv = exportFinanceiroCsv(linhasCsvRecebiveis(res.data.rows, res.data.hoje, rotuloStatus))
   const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
   const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `recebiveis-${res.data.hoje}.csv`; a.click(); URL.revokeObjectURL(url)
  } catch { setErroExport(ui.financeiro_receb_exportar_erro) } finally { setExportando(false) }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [idioma])

 const conferir = ui.financeiro_receb_conferir
 const columns: Column<FinanceiroRecebivel>[] = [
  { key: 'venda', header: ui.financeiro_receb_col_venda, cell: r => <Link className="underline" href={adminVendaDetalheQuery(r.venda_id)}>{r.venda_id.slice(0, 8)}</Link> },
  { key: 'forma', header: ui.financeiro_receb_col_meio, cell: r => r.forma },
  { key: 'parcela', header: ui.financeiro_receb_col_parcela, align: 'right', cell: r => `${r.parcela}/${r.parcelas}` },
  { key: 'bruto', header: ui.financeiro_receb_col_bruto, align: 'right', sortValue: r => r.bruto, cell: r => formatBRL(r.bruto) },
  { key: 'taxa', header: ui.financeiro_receb_col_taxa, align: 'right', cell: r => r.taxa === null ? conferir : formatBRL(r.taxa) },
  { key: 'liquido', header: ui.financeiro_receb_col_liquido, align: 'right', sortValue: r => r.liquido, cell: r => <>{r.taxa === null ? conferir : formatBRL(r.liquido)}{r.devolucao ? ` · ${ui.financeiro_receb_devolucao}` : ''}</> },
  { key: 'previsao', header: ui.financeiro_receb_col_previsao, sortValue: r => r.previsao ?? '', cell: r => r.previsao ? formatarDataCivilNumerica(r.previsao, locale) : conferir },
  { key: 'status', header: ui.financeiro_receb_col_status, cell: r => { const s = statusExibicaoRecebivel(r, data.hoje); return <StatusChip status={STATUS_CHIP_RECEBIVEL[s]} label={rotuloStatus[s]} /> } },
 ]
 const qtd = (n: number) => ui.financeiro_receb_kpi_hint_qtd.replace('{{n}}', String(n))

 return <div className="admin-v2-stack" data-testid="financeiro-recebiveis">
  {resumo.estado === 'carregando' ? <Loading label={ui.financeiro_receb_resumo_carregando} /> : null}
  {resumo.estado === 'erro' ? <ErrorState dense description={resumo.msg || ui.financeiro_receb_resumo_erro} onRetry={() => setTentativa(t => t + 1)} retryLabel={ui.financeiro_receb_tentar} /> : null}
  {resumo.estado === 'ok' ? <>
   <div className="admin-v2-grid-kpi" data-testid="financeiro-recebiveis-resumo">
    <MetricCard label={ui.financeiro_receb_kpi_total} value={formatBRL(resumo.resumo.total)} icon="wallet-cards" hint={qtd(resumo.resumo.qtdTotal)} />
    <MetricCard label={ui.financeiro_receb_kpi_recebido} value={formatBRL(resumo.resumo.recebido)} icon="file-check-2" tone="success" hint={qtd(resumo.resumo.qtdRecebido)} />
    <MetricCard label={ui.financeiro_receb_kpi_aberto} value={formatBRL(resumo.resumo.aberto)} icon="dollar-sign" tone="gold" hint={qtd(resumo.resumo.qtdAberto)} />
    <MetricCard label={ui.financeiro_receb_kpi_vencido} value={formatBRL(resumo.resumo.vencido)} icon="alert-circle" tone="danger" hint={qtd(resumo.resumo.qtdVencido)} />
   </div>
   {resumo.truncado ? <p className="text-caption">{ui.financeiro_receb_kpi_hint_truncado.replace('{{n}}', String(resumo.n))}</p> : null}
  </> : null}
  <div className="flex flex-wrap items-center justify-end gap-2">
   {erroExport ? <p role="alert" className="text-small text-[var(--color-danger-strong)]">{erroExport}</p> : null}
   <button type="button" className="admin-v2-btn-secondary" onClick={() => void exportar()} disabled={exportando || data.contagens.recebiveis === 0}>{exportando ? ui.financeiro_receb_exportando : ui.financeiro_receb_exportar}</button>
  </div>
  <DataTable
   columns={columns}
   data={data.recebiveis}
   rowKey={r => r.id}
   compact
   caption={ui.financeiro_receb_tabela_caption}
   emptyState={<EmptyState title={ui.financeiro_receb_vazio_titulo} description={ui.financeiro_receb_vazio_desc} />}
  />
 </div>
}
