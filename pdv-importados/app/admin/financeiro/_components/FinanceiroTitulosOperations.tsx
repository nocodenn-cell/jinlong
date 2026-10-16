'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/lib/navigation/routes'
import { formatBRL } from '@/lib/format/money'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { CategoriaOptions, ContaOptions } from './FinanceiroOptions'
import { opcoesComFoco, type FocoTituloConta } from './baixaLinha'
import { useTextosBaixaForm } from './textosBaixaForm'

type TituloPainel = FinanceiroPainel['pagar'][number]

function rotuloTitulo(t: TituloPainel): string {
  const aberto = t.valor_aberto ?? t.valor_total - (t.valor_pago ?? 0)
  return `${t.nome} · ${t.descricao} · ${formatBRL(aberto)}`
}

function titulosDaBaixa(data: FinanceiroPainel, tipo: 'AP' | 'AR', foco: FocoTituloConta | null) {
  const abertos = (tipo === 'AP' ? data.pagar : data.receber).filter(
    (t) => !['PAGO', 'QUITADO', 'CANCELADO'].includes(t.status),
  )
  const base = abertos.map((t) => ({ id: t.id, rotulo: rotuloTitulo(t) }))
  const extra = foco ? { id: foco.id, rotulo: foco.rotulo } : { id: '', rotulo: '' }
  return opcoesComFoco(base, foco, tipo, extra)
}

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

export function FinanceiroTitulosOperations({
  data,
  tipo,
  foco = null,
  tituloFormulario,
}: {
  data: FinanceiroPainel
  tipo: 'AP' | 'AR'
  foco?: FocoTituloConta | null
  tituloFormulario?: string
}) {
 const textos = useTextosBaixaForm()
 const titulos = titulosDaBaixa(data, tipo, foco)
 const selecionado = foco?.tipo === tipo ? foco.id : ''
 useEffect(() => {
  if (!selecionado) return
  document.getElementById('baixa-conta-financeira')?.scrollIntoView?.({ block: 'start' })
 }, [selecionado])
 return <div id="baixa-conta-financeira" className="admin-v2-stack">
  {tipo === 'AP' ? <FinanceiroDespesaForm data={data} /> : null}
  <FinanceiroForm key={`baixa-${tipo}-${selecionado || 'livre'}`} title={tituloFormulario ?? (tipo === 'AP' ? textos.pagarConta : textos.receberConta)} tipo={tipo === 'AP' ? 'BAIXAR_AP' : 'BAIXAR_AR'} submit={tipo === 'AP' ? textos.pagar : textos.receber}>
   <Field name="titulo_id" label={textos.titulo} value={selecionado}><option value="">{textos.selecione}</option>{titulos.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</Field>
   <Field name="conta_id" label={tipo === 'AP' ? textos.contaOrigem : textos.contaDestino}><ContaOptions data={data} /></Field>
   <Field name="valor" label={textos.valor} type="number" />
   <Field name="data" label={textos.data} type="date" value={data.hoje} />
   <Field name="descricao" label="Observação / referência do comprovante" required={false} />
  </FinanceiroForm>
  <FinanceiroForm title={textos.classificar} tipo="CLASSIFICAR_TITULO" fixed={{ tipo }}>
   <Field name="titulo_id" label="Título desta página"><option value="">{textos.selecione}</option>{(tipo === 'AP' ? data.pagar : data.receber).map(t => <option key={t.id} value={t.id}>{t.nome} · {t.descricao} · {t.vencimento}</option>)}</Field>
   <Field name="categoria_id" label="Categoria"><CategoriaOptions data={data} tipo={tipo === 'AP' ? 'DESPESA' : 'RECEITA'} /></Field>
   <Field name="data" label={textos.competencia} type="date" value={data.hoje} />
  </FinanceiroForm>
 </div>
}
