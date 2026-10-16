'use client'

import Link from 'next/link'
import { ROUTES } from '@/lib/navigation/routes'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { CategoriaOptions } from './FinanceiroOptions'
import { useTextosBaixaForm } from './textosBaixaForm'

/** Nova despesa (CRIAR_AP). Usada no modal "Pagar / Registrar despesa" do Financeiro. */
export function FinanceiroDespesaForm({ data }: { data: FinanceiroPainel }) {
 const textos = useTextosBaixaForm()
 return <FinanceiroForm title={textos.novaDespesa} tipo="CRIAR_AP">
  <Field name="descricao" label="Descrição" />
  <Field name="favorecido" label="Favorecido (quando não houver fornecedor)" required={false} />
  <Field name="fornecedor_id" label="Fornecedor cadastrado" required={false}><option value="">Sem fornecedor</option>{data.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</Field>
  <Field name="categoria_id" label="Categoria"><CategoriaOptions data={data} tipo="DESPESA" /></Field>
  <Field name="valor" label={textos.valorMensal} type="number" />
  <Field name="data" label={textos.primeiroVencimento} type="date" value={data.hoje} />
  <Field name="competencia" label={textos.competenciaInicial} type="date" value={data.hoje} />
  <Field name="parcelas" label="Número de parcelas ou meses (1 a 60)" type="number" value={1} />
  <Field name="recorrente" label="Como gerar"><option value="false">Dividir o valor total em parcelas</option><option value="true">Repetir o valor a cada mês</option></Field>
  <Link href={ROUTES.admin.fornecedores} className="text-small underline">Gerenciar fornecedores</Link>
 </FinanceiroForm>
}
