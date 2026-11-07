'use client'

import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { CategoriaOptions } from './FinanceiroOptions'
import { useTextosBaixaForm } from './textosBaixaForm'

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
