'use client'

import Link from 'next/link'
import { adminVendaDetalheQuery } from '@/lib/navigation/routes'
import { formatBRL } from '@/lib/format/money'
import { SectionCard } from '@/components/ui/admin-v2'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { ContaOptions } from './FinanceiroOptions'

export function FinanceiroRecebiveis({ data }: { data: FinanceiroPainel }) {
 const pendentes = data.recebiveis.filter(r => r.status === 'PENDENTE')
 return <div className="admin-v2-stack">
  <SectionCard title="Agenda de PIX e cartões">
   <p className="mb-3 text-small text-jl-fg-3">Novas vendas geram recebíveis automaticamente, incluindo pagamentos mistos. Taxa e previsão precisam ser conferidas. Histórico anterior à atualização permanece em Vendas.</p>
   <div className="overflow-x-auto"><table className="w-full text-small"><thead><tr>{['Venda','Meio','Bruto','Taxa','Líquido estimado','Previsão','Status'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{data.recebiveis.map(r => <tr key={r.id} className="border-t border-[var(--color-border-secondary)]"><td className="p-2"><Link className="underline" href={adminVendaDetalheQuery(r.venda_id)}>{r.venda_id.slice(0,8)}</Link></td><td className="p-2">{r.forma}</td><td className="p-2">{formatBRL(r.bruto)}</td><td className="p-2">{r.taxa === null ? 'Conferir' : formatBRL(r.taxa)}</td><td className="p-2">{r.taxa === null ? 'Conferir taxa' : formatBRL(r.liquido)}{r.devolucao ? ' · devolução' : ''}</td><td className="p-2">{r.previsao ?? 'Conferir'}</td><td className="p-2">{r.status}</td></tr>)}</tbody></table></div>
   {!data.recebiveis.length ? <p className="py-4">Nenhum recebível nesta página.</p> : null}
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
