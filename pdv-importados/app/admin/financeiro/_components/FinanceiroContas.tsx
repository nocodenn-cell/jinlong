'use client'

import { formatBRL } from '@/lib/format/money'
import { SectionCard } from '@/components/ui/admin-v2'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { CategoriaOptions, ContaOptions } from './FinanceiroOptions'

const FORMAS = [
  { id: 'DINHEIRO', label: 'Dinheiro (gaveta / reserva)' },
  { id: 'PIX', label: 'PIX → banco' },
  { id: 'CARTAO_CREDITO', label: 'Cartão crédito → a receber no banco' },
  { id: 'CARTAO_DEBITO', label: 'Cartão débito → a receber no banco' },
] as const

export function FinanceiroContas({ data }: { data: FinanceiroPainel }) {
 const contasForma = data.contas_forma ?? []
 return <div className="admin-v2-stack">
  <SectionCard title="Saldos registrados no sistema">
   <p className="mb-3 text-small text-jl-fg-3">O saldo atual é a soma dos movimentos oficiais. Não há edição direta do saldo.</p>
   <ul className="grid gap-3 sm:grid-cols-3">{data.contas.map(c => <li key={c.id} className="rounded-lg border border-[var(--color-border-secondary)] p-3"><p className="font-semibold">{c.nome}{c.ativo ? '' : ' · inativa'}</p><p className="text-xl font-semibold">{formatBRL(c.saldo)}</p><p className="text-caption text-jl-fg-3">{c.tipo === 'BANCO' ? 'Banco' : 'Reserva de numerário fora do PDV'}</p></li>)}</ul>
   {!data.contas.length ? <p>Cadastre uma conta e informe o saldo conferido na data inicial.</p> : null}
  </SectionCard>

  <FinanceiroForm title="Cadastrar conta financeira" tipo="CRIAR_CONTA" transform={d => { const r = { ...d }; if (!r.valor || Number(r.valor) === 0) delete r.valor; return r }}>
   <Field name="nome" label="Nome da conta" />
   <Field name="tipo" label="Tipo"><option value="BANCO">Conta bancária</option><option value="RESERVA">Reserva de numerário fora do PDV</option></Field>
   <Field name="data" label="Data do saldo inicial" type="date" value={data.hoje} />
   <Field name="valor" label="Saldo inicial conferido (R$)" type="number" value={0} required={false} />
  </FinanceiroForm>

  <FinanceiroForm title="Ativar ou inativar conta" tipo="ALTERAR_CONTA" operacional>
   <Field name="conta_id" label="Conta"><ContaOptions data={data} incluirInativas /></Field>
   <Field name="nome" label="Nome (opcional)" required={false} />
   <Field name="ativo" label="Situação"><option value="true">Ativa</option><option value="false">Inativa</option></Field>
  </FinanceiroForm>

  <FinanceiroForm title="Conta padrão por forma de pagamento (novas operações)" tipo="CONFIGURAR_CONTA_FORMA" operacional>
   <p className="text-small sm:col-span-2">Vale apenas para vendas e baixas novas. Não relança histórico nem reconstrói saldos. Dinheiro continua na gaveta do PDV; reserve só se quiser espelho de numerário fora do turno.</p>
   <Field name="forma_pagamento" label="Forma">{FORMAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</Field>
   <Field name="conta_id" label="Conta padrão" required={false}><option value="">Sem conta (só gaveta / configurar depois)</option><ContaOptions data={data} /></Field>
   {contasForma.length ? <ul className="sm:col-span-2 text-small text-jl-fg-3">{contasForma.map(f => <li key={f.forma_pagamento}>{f.forma_pagamento}: {f.conta_nome ?? 'não configurada'}</li>)}</ul> : null}
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
