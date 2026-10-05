'use client'

import { formatBRL } from '@/lib/format/money'
import { SectionCard } from '@/components/ui/admin-v2'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { CategoriaOptions, ContaOptions } from './FinanceiroOptions'

export function FinanceiroContas({ data }: { data: FinanceiroPainel }) {
 return <div className="admin-v2-stack">
  <SectionCard title="Saldos por conta"><ul className="grid gap-3 sm:grid-cols-3">{data.contas.map(c => <li key={c.id} className="rounded-lg border border-[var(--color-border-secondary)] p-3"><p>{c.nome}</p><p className="text-xl font-semibold">{formatBRL(c.saldo)}</p><p className="text-caption text-jl-fg-3">{c.tipo === 'BANCO' ? 'Banco' : 'Reserva de numerário fora do PDV'}</p></li>)}</ul>{!data.contas.length ? <p>Cadastre uma conta e informe o saldo conferido na data inicial.</p> : null}</SectionCard>
  <FinanceiroForm title="Cadastrar conta financeira" tipo="CRIAR_CONTA" transform={d => { const r = { ...d }; if (!r.valor || Number(r.valor) === 0) delete r.valor; return r }}>
   <Field name="nome" label="Nome da conta" />
   <Field name="tipo" label="Tipo"><option value="BANCO">Conta bancária</option><option value="RESERVA">Reserva de numerário fora do PDV</option></Field>
   <Field name="data" label="Data do saldo inicial" type="date" value={data.hoje} />
   <Field name="valor" label="Saldo inicial conferido (R$)" type="number" value={0} required={false} />
  </FinanceiroForm>
  <FinanceiroForm title="Transferir entre contas" tipo="TRANSFERIR">
   <Field name="conta_id" label="Origem"><ContaOptions data={data} /></Field>
   <Field name="destino_id" label="Destino"><ContaOptions data={data} /></Field>
   <Field name="valor" label="Valor (R$)" type="number" />
   <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
  </FinanceiroForm>
  <FinanceiroForm title="Vincular transferência já realizada no PDV" tipo="VINCULAR_CAIXA">
   <p className="text-small sm:col-span-2">Após a sangria ou o suprimento aprovado em Caixas/PDV, selecione a conta correspondente. Este vínculo registra a contrapartida; não movimenta a gaveta novamente.</p>
   <Field name="movimento_id" label="Sangria / suprimento aprovado"><option value="">Selecione</option>{data.movimentos_caixa.map(m => <option key={m.id} value={m.id}>{m.tipo} · {formatBRL(m.valor)} · {m.caixa_id.slice(0,8)}</option>)}</Field>
   <Field name="conta_id" label="Conta de contrapartida"><ContaOptions data={data} /></Field>
   <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
  </FinanceiroForm>
  <FinanceiroForm title="Entrada ou saída avulsa" tipo="MOVIMENTO">
   <p className="text-small sm:col-span-2">Use para movimentos sem título. Para pagar uma despesa ou receber uma dívida já registrada, use a baixa do título.</p>
   <Field name="conta_id" label="Conta"><ContaOptions data={data} /></Field>
   <Field name="direcao" label="Direção"><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></Field>
   <Field name="categoria_id" label="Categoria"><CategoriaOptions data={data} /></Field>
   <Field name="descricao" label="Descrição" />
   <Field name="valor" label="Valor (R$)" type="number" />
   <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
  </FinanceiroForm>
 </div>
}
