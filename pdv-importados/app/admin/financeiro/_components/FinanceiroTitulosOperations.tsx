'use client'

import Link from 'next/link'
import { ROUTES } from '@/lib/navigation/routes'
import { formatBRL } from '@/lib/format/money'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { CategoriaOptions, ContaOptions } from './FinanceiroOptions'

export function FinanceiroDespesaForm({ data }: { data: FinanceiroPainel }) {
 return <FinanceiroForm title="Nova despesa" tipo="CRIAR_AP">
  <Field name="descricao" label="Descrição" />
  <Field name="favorecido" label="Favorecido (quando não houver fornecedor)" required={false} />
  <Field name="fornecedor_id" label="Fornecedor cadastrado" required={false}><option value="">Sem fornecedor</option>{data.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</Field>
  <Field name="categoria_id" label="Categoria"><CategoriaOptions data={data} tipo="DESPESA" /></Field>
  <Field name="valor" label="Valor total ou valor mensal (R$)" type="number" />
  <Field name="data" label="Primeiro vencimento" type="date" value={data.hoje} />
  <Field name="competencia" label="Competência inicial" type="date" value={data.hoje} />
  <Field name="parcelas" label="Número de parcelas ou meses (1 a 60)" type="number" value={1} />
  <Field name="recorrente" label="Como gerar"><option value="false">Dividir o valor total em parcelas</option><option value="true">Repetir o valor a cada mês</option></Field>
  <Link href={ROUTES.admin.fornecedores} className="text-small underline">Gerenciar fornecedores</Link>
 </FinanceiroForm>
}

export function FinanceiroTitulosOperations({ data, tipo }: { data: FinanceiroPainel; tipo: 'AP' | 'AR' }) {
 const titulos = (tipo === 'AP' ? data.pagar : data.receber).filter(t => !['PAGO','QUITADO','CANCELADO'].includes(t.status))
 return <div className="admin-v2-stack">
  {tipo === 'AP' ? <FinanceiroDespesaForm data={data} /> : null}
  <FinanceiroForm title={tipo === 'AP' ? 'Pagar pela conta financeira' : 'Receber na conta financeira'} tipo={tipo === 'AP' ? 'BAIXAR_AP' : 'BAIXAR_AR'}>
   <Field name="titulo_id" label="Título desta página"><option value="">Selecione</option>{titulos.map(t => <option key={t.id} value={t.id}>{t.nome} · {t.descricao} · {formatBRL(t.valor_aberto ?? t.valor_total - (t.valor_pago ?? 0))}</option>)}</Field>
   <Field name="conta_id" label={tipo === 'AP' ? 'Conta de origem' : 'Conta de destino'}><ContaOptions data={data} /></Field>
   <Field name="valor" label="Valor da baixa (R$)" type="number" />
   <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
   <Field name="descricao" label="Observação / referência do comprovante" required={false} />
  </FinanceiroForm>
  <FinanceiroForm title="Classificar título" tipo="CLASSIFICAR_TITULO" fixed={{ tipo }}>
   <Field name="titulo_id" label="Título desta página"><option value="">Selecione</option>{(tipo === 'AP' ? data.pagar : data.receber).map(t => <option key={t.id} value={t.id}>{t.nome} · {t.descricao} · {t.vencimento}</option>)}</Field>
   <Field name="categoria_id" label="Categoria"><CategoriaOptions data={data} tipo={tipo === 'AP' ? 'DESPESA' : 'RECEITA'} /></Field>
   <Field name="data" label="Competência" type="date" value={data.hoje} />
  </FinanceiroForm>
 </div>
}
