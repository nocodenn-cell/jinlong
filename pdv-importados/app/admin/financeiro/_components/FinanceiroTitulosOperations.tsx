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

/**
 * Classificação de títulos da página. Baixa e nova despesa saíram daqui:
 * agora abrem no modal de Receber/Pagar, já com o título da linha selecionado.
 */
export function FinanceiroTitulosOperations({
  data,
  tipo,
}: {
  data: FinanceiroPainel
  tipo: 'AP' | 'AR'
}) {
 const textos = useTextosBaixaForm()
 return <div className="admin-v2-stack">
  <FinanceiroForm title={textos.classificar} tipo="CLASSIFICAR_TITULO" fixed={{ tipo }}>
   <Field name="titulo_id" label="Título desta página"><option value="">{textos.selecione}</option>{(tipo === 'AP' ? data.pagar : data.receber).map(t => <option key={t.id} value={t.id}>{t.nome} · {t.descricao} · {t.vencimento}</option>)}</Field>
   <Field name="categoria_id" label="Categoria"><CategoriaOptions data={data} tipo={tipo === 'AP' ? 'DESPESA' : 'RECEITA'} /></Field>
   <Field name="data" label={textos.competencia} type="date" value={data.hoje} />
  </FinanceiroForm>
 </div>
}
