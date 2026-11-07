'use client'

import { useContext, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { SectionCard } from '@/components/ui/admin-v2'
import { AdminV2SessionContext } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'
import { executarFinanceiroLoja, executarFinanceiroOperacional } from '../financeiroLojaActions'
import type { FinanceiroOperacao, FinanceiroOperacaoOperacional } from '../financeiroLojaTypes'

function textosEnvio(idioma: 'pt' | 'zh' | undefined) {
  const ui = getMessages(idioma ?? 'pt').admin_ui
  return {
    registrando: ui.financeiro_registrando,
    ok: ui.financeiro_operacao_ok,
    invalido: ui.financeiro_dados_invalidos,
    falha: ui.financeiro_falha_comunicacao,
    salvar: getMessages(idioma ?? 'pt').comum.salvar,
  }
}

export function FinanceiroField({ name, label, type = 'text', value, required = true, children }: { name: string; label: string; type?: string; value?: string | number; required?: boolean; children?: ReactNode }) {
 return <label className="grid gap-1 text-small text-jl-fg-2">{label}{children ? <select name={name} required={required} className="fp-control" defaultValue={value}>{children}</select> : <input name={name} type={type} defaultValue={value} required={required} step={type === 'number' ? '0.01' : undefined} className="fp-control" />}</label>
}

type Operacao = FinanceiroOperacao | FinanceiroOperacaoOperacional

export function FinanceiroForm({ title, tipo, fixed = {}, children, submit, transform, operacional = false }: { title: string; tipo: Operacao; fixed?: Record<string, unknown>; children?: ReactNode; submit?: string; transform?: (data: Record<string, unknown>) => Record<string, unknown>; operacional?: boolean }) {
 const router = useRouter()
 const idioma = useContext(AdminV2SessionContext)?.idioma
 const textos = textosEnvio(idioma)
 const [pending, setPending] = useState(false)
 const [message, setMessage] = useState('')
 const [failed, setFailed] = useState(false)
 const ocupado = useRef(false)
 async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (ocupado.current) return
  ocupado.current = true
  const form = event.currentTarget
  const dados = { ...Object.fromEntries(new FormData(form)), ...fixed }
  let payload: Record<string, unknown>
  try { payload = transform ? transform(dados) : dados } catch (e) {
   ocupado.current = false
   setFailed(true)
   setMessage(e instanceof Error ? e.message : textos.invalido)
   return
  }
  const serialized = JSON.stringify(payload)
  if (form.dataset.payload !== serialized) { form.dataset.requestId = crypto.randomUUID(); form.dataset.payload = serialized }
  setPending(true); setMessage('')
  try {
   const result = operacional
    ? await executarFinanceiroOperacional({ tipo, dados: payload, requestId: form.dataset.requestId })
    : await executarFinanceiroLoja({ tipo, dados: payload, requestId: form.dataset.requestId })
   setFailed(!result.ok); setMessage(result.ok ? textos.ok : result.error)
   if (result.ok) { delete form.dataset.payload; delete form.dataset.requestId; form.reset(); router.refresh() }
  } catch { setFailed(true); setMessage(textos.falha) } finally { ocupado.current = false; setPending(false) }
 }
 return <SectionCard title={title}><form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2"><fieldset disabled={pending} className="contents">{children}<button className="admin-v2-btn-primary sm:col-span-2 sm:justify-self-end" type="submit" disabled={pending} aria-busy={pending}>{pending ? textos.registrando : (submit ?? textos.salvar)}</button></fieldset></form>{message ? <p role={failed ? 'alert' : 'status'} className={failed ? 'mt-3 text-[var(--color-danger-strong)]' : 'mt-3 text-jl-fg-2'}>{message}</p> : null}</SectionCard>
}
