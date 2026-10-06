'use client'

import { useState, type ReactNode, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { SectionCard } from '@/components/ui/admin-v2'
import { executarFinanceiroLoja, executarFinanceiroOperacional } from '../financeiroLojaActions'
import type { FinanceiroOperacao, FinanceiroOperacaoOperacional } from '../financeiroLojaTypes'

export function FinanceiroField({ name, label, type = 'text', value, required = true, children }: { name: string; label: string; type?: string; value?: string | number; required?: boolean; children?: ReactNode }) {
 return <label className="grid gap-1 text-small text-jl-fg-2">{label}{children ? <select name={name} required={required} className="fp-control" defaultValue={value}>{children}</select> : <input name={name} type={type} defaultValue={value} required={required} step={type === 'number' ? '0.01' : undefined} className="fp-control" />}</label>
}

type Operacao = FinanceiroOperacao | FinanceiroOperacaoOperacional

export function FinanceiroForm({ title, tipo, fixed = {}, children, submit = 'Salvar', transform, operacional = false }: { title: string; tipo: Operacao; fixed?: Record<string, unknown>; children?: ReactNode; submit?: string; transform?: (data: Record<string, unknown>) => Record<string, unknown>; operacional?: boolean }) {
 const router = useRouter()
 const [pending, setPending] = useState(false)
 const [message, setMessage] = useState('')
 const [failed, setFailed] = useState(false)
 async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const form = event.currentTarget
  const dados = { ...Object.fromEntries(new FormData(form)), ...fixed }
  let payload: Record<string, unknown>
  try { payload = transform ? transform(dados) : dados } catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : 'Dados inválidos.'); return }
  const serialized = JSON.stringify(payload)
  if (form.dataset.payload !== serialized) { form.dataset.requestId = crypto.randomUUID(); form.dataset.payload = serialized }
  setPending(true); setMessage('')
  try {
   const result = operacional
    ? await executarFinanceiroOperacional({ tipo, dados: payload, requestId: form.dataset.requestId })
    : await executarFinanceiroLoja({ tipo, dados: payload, requestId: form.dataset.requestId })
   setFailed(!result.ok); setMessage(result.ok ? 'Operação registrada.' : result.error)
   if (result.ok) { delete form.dataset.payload; delete form.dataset.requestId; form.reset(); router.refresh() }
  } catch { setFailed(true); setMessage('Falha de comunicação. Tente novamente; a operação não será duplicada.') } finally { setPending(false) }
 }
 return <SectionCard title={title}><form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2"><fieldset disabled={pending} className="contents">{children}<button className="admin-v2-btn-primary sm:col-span-2 sm:justify-self-end" type="submit" disabled={pending}>{pending ? 'Registrando…' : submit}</button></fieldset></form>{message ? <p role={failed ? 'alert' : 'status'} className={failed ? 'mt-3 text-[var(--color-danger-strong)]' : 'mt-3 text-jl-fg-2'}>{message}</p> : null}</SectionCard>
}
