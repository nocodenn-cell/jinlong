'use client'

import { useState, useEffect } from 'react'
import { SectionCard } from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { parseExtratoCsv } from '../financeiroCsv'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { ContaOptions } from './FinanceiroOptions'
import { buscarCandidatosConciliacao } from '../financeiroLojaActions'

export function FinanceiroConciliacao({ data }: { data: FinanceiroPainel }) {
 const [csv, setCsv] = useState('')
 const [selected, setSelected] = useState('')
 const extrato = data.extratos.find(e => e.id === selected)
 const [busca,setBusca] = useState('')
 const [movimentos,setMovimentos] = useState<{ id:string; data:string; descricao:string; valor:number }[]>([])
 const [feedback,setFeedback] = useState('')
 useEffect(() => {
  let active=true
  setMovimentos([])
  if (!selected) { setFeedback('Selecione uma linha do extrato.'); return }
  setFeedback('Buscando movimentos…')
  const timer=setTimeout(() => {
   void buscarCandidatosConciliacao(selected,busca).then(r => { if (active) { setMovimentos(r.ok ? r.data : []); setFeedback(r.ok ? '' : r.error) } }).catch(() => { if (active) setFeedback('Não foi possível buscar movimentos. Tente novamente.') })
  },250)
  return () => { active=false; clearTimeout(timer) }
 },[selected,busca,data])
 return <div className="admin-v2-stack">
  <FinanceiroForm title="Importar extrato CSV" tipo="IMPORTAR_EXTRATO" transform={d => ({ ...d, linhas: parseExtratoCsv(csv) })}>
   <Field name="conta_id" label="Conta do extrato"><ContaOptions data={data} /></Field>
   <label className="grid gap-1 text-small">Arquivo CSV<input type="file" accept=".csv,text/csv" className="fp-control" onChange={async e => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()) }} /></label>
   <label className="grid gap-1 text-small sm:col-span-2">Conteúdo do extrato<textarea className="fp-control min-h-28" value={csv} onChange={e => setCsv(e.target.value)} required placeholder={'referencia;data;descricao;valor\nBANCO-001;2026-10-04;Depósito;100.00'} /></label>
   <p className="text-caption sm:col-span-2">Valores assinados: crédito positivo, débito negativo. Até 500 linhas. A referência bancária impede duplicação; importar não altera o saldo.</p>
  </FinanceiroForm>
  <SectionCard title="Extrato importado"><div className="overflow-x-auto"><table className="w-full text-small"><thead><tr>{['Referência','Data','Descrição','Valor','Conferência'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{data.extratos.map(e => <tr key={e.id} className="border-t border-[var(--color-border-secondary)]"><td className="p-2">{e.referencia}</td><td className="p-2">{e.data}</td><td className="p-2">{e.descricao}</td><td className="p-2">{formatBRL(e.valor)}</td><td className="p-2">{e.conciliacao_id ? 'Conciliado' : 'Pendente'}</td></tr>)}</tbody></table></div></SectionCard>
  <FinanceiroForm title="Conciliar lançamento" tipo="CONCILIAR">
   <label className="grid gap-1 text-small">Linha do extrato<select className="fp-control" name="extrato_id" required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Selecione</option>{data.extratos.filter(e => !e.conciliacao_id).map(e => <option key={e.id} value={e.id}>{e.data} · {e.descricao} · {formatBRL(e.valor)}</option>)}</select></label>
   <label className="grid gap-1 text-small">Buscar descrição do movimento<input className="fp-control" value={busca} maxLength={120} onChange={e => setBusca(e.target.value)} /></label>
   <Field key={`${selected}:${busca}`} name="movimento_id" label="Movimento de mesma conta e valor"><option value="">Selecione</option>{movimentos.map(m => <option key={m.id} value={m.id}>{m.data} · {m.descricao} · {formatBRL(m.valor)}</option>)}</Field>
   <Field name="descricao" label="Observação da conferência" />
   {feedback ? <p role="status" className="text-small sm:col-span-2">{feedback}</p> : null}
   {extrato && !feedback && !movimentos.length ? <p className="text-small sm:col-span-2">Nenhum movimento correspondente. Registre taxas ou corrija a operação de origem antes de conciliar.</p> : null}
   <p className="text-caption sm:col-span-2">A busca considera todo o histórico da conta e mostra até 100 correspondências mais próximas da data do extrato. Use a descrição para refinar.</p>
  </FinanceiroForm>
  <FinanceiroForm title="Desfazer conciliação" tipo="DESCONCILIAR">
   <Field name="conciliacao_id" label="Linha conciliada"><option value="">Selecione</option>{data.extratos.filter(e => e.conciliacao_id).map(e => <option key={e.id} value={e.conciliacao_id!}>{e.data} · {e.descricao}</option>)}</Field>
   <Field name="descricao" label="Motivo" />
  </FinanceiroForm>
 </div>
}
