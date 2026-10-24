'use client'

import { useRef, useState, type FormEvent } from 'react'
import { leadExtrasSchema, readUtms } from '@/lib/leadSchema'
import { trackLead } from '@/lib/track'
import type { TrialFormCopy } from '@/lib/content/types'
import { isValidContact, type DemoFieldError, type DemoLocale } from '@/lib/demoRequest'

interface TrialFormProps {
  copy: TrialFormCopy
  email: string
  whatsappHref: string | null
  locale: DemoLocale
}

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'ok'; protocol: string }
  | { kind: 'fail'; rate: boolean }

type Values = { name: string; store: string; contact: string; segment: string; idioma: string }
type FieldId = 'name' | 'store' | 'contact' | 'segment'

const FIELD_ORDER: readonly FieldId[] = ['name', 'store', 'contact', 'segment']

function localErrors(v: Values): DemoFieldError[] {
  const out: DemoFieldError[] = []
  if (v.name.trim().length < 2) out.push('name')
  if (v.store.trim().length < 2) out.push('store')
  if (!isValidContact(v.contact.trim(), 'whatsapp')) out.push('contact')
  const extras = leadExtrasSchema.safeParse({ segment: v.segment, idioma: v.idioma })
  if (!extras.success && extras.error.issues.some((issue) => issue.path[0] === 'segment')) out.push('segment')
  return out
}

/**
 * Pedido de demonstração: POST /pedido-demo registra o pedido e devolve um protocolo.
 * Se o registro falhar (sem configuração, indisponível, limite), mostra e-mail/WhatsApp com o texto pronto —
 * o pedido nunca se perde em silêncio. Nenhum dado pessoal vai para a URL.
 */
export function TrialForm({ copy, email, whatsappHref, locale }: TrialFormProps) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [errors, setErrors] = useState<DemoFieldError[]>([])
  const [values, setValues] = useState<Values>({ name: '', store: '', contact: '', segment: '', idioma: locale })
  const statusRef = useRef<HTMLDivElement>(null)

  const segmentLabel = copy.segments.find((s) => s.value === values.segment)?.label ?? values.segment
  const summary = `${copy.mailSubject}\n\n${copy.name}: ${values.name}\n${copy.store}: ${values.store}\n${copy.contact}: ${values.contact}\n${copy.segment}: ${segmentLabel}`
  const waLink = (text: string) => {
    if (!whatsappHref) return null
    const url = new URL(whatsappHref)
    url.searchParams.set('text', text)
    return url.toString()
  }
  const focusStatus = () => requestAnimationFrame(() => statusRef.current?.focus())

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const g = (k: string) => String(data.get(k) ?? '')
    const v: Values = { name: g('name'), store: g('store'), contact: g('contact'), segment: g('segment'), idioma: g('idioma') || locale }
    setValues(v)
    const local = localErrors(v)
    setErrors(local)
    if (local.length) {
      const first = FIELD_ORDER.find((id) => local.includes(id))
      form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    setState({ kind: 'sending' })
    try {
      const res = await fetch('/pedido-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, channel: 'whatsapp', locale, ...readUtms(window.location.search), website: g('website') }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; protocol?: string; error?: string; fields?: DemoFieldError[] } | null
      if (res.ok && body?.ok && body.protocol) {
        trackLead()
        setState({ kind: 'ok', protocol: body.protocol })
        // Página de obrigado (conversão de anúncios); só o protocolo vai na URL, nenhum dado pessoal.
        const target = v.idioma === 'zh-CN' ? 'zh-CN' : 'pt-BR'
        window.location.assign(`/${target}/obrigado?p=${encodeURIComponent(body.protocol)}`)
        return
      }
      if (res.status === 400 && body?.fields?.length) {
        setErrors(body.fields)
        setState({ kind: 'idle' })
        return
      }
      console.error(`[Jinlong lead] envio falhou: HTTP ${res.status} (${body?.error ?? 'sem detalhe'})`)
      setState({ kind: 'fail', rate: res.status === 429 })
    } catch (err) {
      console.error('[Jinlong lead] erro de rede ao enviar:', err instanceof Error ? err.message : 'desconhecido')
      setState({ kind: 'fail', rate: false })
    }
    focusStatus()
  }

  if (state.kind === 'ok') {
    const wa = waLink(`${copy.thanksWaText} ${state.protocol}`)
    return (
      <div className="jl-form-card jl-form-done" role="status" aria-labelledby="h-form" tabIndex={-1} ref={statusRef}>
        <p className="jl-form-top">
          <span>{copy.top}</span>
          <span aria-hidden="true">✓</span>
        </p>
        <h3 id="h-form">{copy.okTitle}</h3>
        <p>{copy.okBody}</p>
        <p className="jl-protocol">
          {copy.okProtocol}: <strong data-testid="protocol">{state.protocol}</strong>
        </p>
        <p>{copy.okKeep}</p>
        {wa && (
          <a className="jl-form-action" href={wa} target="_blank" rel="noopener noreferrer">
            {copy.okWhatsapp} <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    )
  }

  const errText: Partial<Record<DemoFieldError, string>> = {
    name: copy.errName,
    store: copy.errStore,
    contact: copy.errContact,
    segment: copy.errSegment,
  }
  const describe = (id: FieldId, hint: boolean) =>
    [hint ? `${id}-hint` : '', errors.includes(id) ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
  const errorFor = (id: FieldId) =>
    errors.includes(id) ? (
      <small id={`${id}-err`} className="jl-err">
        {errText[id]}
      </small>
    ) : null
  const input = (id: Exclude<FieldId, 'segment'>, label: string, type: string, auto: string, max: number, hint?: string) => (
    <label key={id}>
      <span>{label}</span>
      <input
        name={id}
        type={type}
        required
        minLength={id === 'contact' ? 10 : 2}
        maxLength={max}
        autoComplete={auto}
        inputMode={id === 'contact' ? 'tel' : undefined}
        aria-invalid={errors.includes(id) || undefined}
        aria-describedby={describe(id, Boolean(hint))}
        defaultValue={values[id]}
      />
      {hint && (
        <small id={`${id}-hint`} className="jl-hint">
          {hint}
        </small>
      )}
      {errorFor(id)}
    </label>
  )
  const mail = `mailto:${email}?subject=${encodeURIComponent(copy.mailSubject)}&body=${encodeURIComponent(summary)}`
  const waFail = waLink(summary)

  return (
    <div className="jl-form-card">
      <p className="jl-form-top">
        <span>{copy.top}</span>
        <span aria-hidden="true">↗</span>
      </p>
      <form className="jl-form" onSubmit={onSubmit} aria-labelledby="h-form" noValidate>
        <h3 id="h-form">{copy.title}</h3>
        <p className="jl-form-lead">{copy.lead}</p>
        {input('name', copy.name, 'text', 'name', 80)}
        {input('store', copy.store, 'text', 'organization', 120)}
        {input('contact', copy.contact, 'tel', 'tel', 60, copy.contactHint)}
        <label>
          <span>{copy.segment}</span>
          <select
            name="segment"
            required
            defaultValue={values.segment}
            aria-invalid={errors.includes('segment') || undefined}
            aria-describedby={describe('segment', false)}
          >
            <option value="">{copy.segmentPlaceholder}</option>
            {copy.segments.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {errorFor('segment')}
        </label>
        <label>
          <span>{copy.idioma}</span>
          <select name="idioma" defaultValue={values.idioma}>
            <option value="pt-BR" lang="pt-BR">
              Português
            </option>
            <option value="zh-CN" lang="zh-CN">
              简体中文
            </option>
          </select>
        </label>
        <div className="jl-hp" aria-hidden="true">
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button type="submit" className="jl-form-action" disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? copy.sending : copy.submit}
          <span aria-hidden="true">↗</span>
        </button>
        <small className="jl-form-note">
          {copy.note} {copy.privacy}
        </small>
      </form>
      {state.kind === 'fail' && (
        <div className="jl-form-fail" role="alert" tabIndex={-1} ref={statusRef}>
          <p>
            <strong>{copy.failTitle}</strong>
          </p>
          <p>{state.rate ? copy.errRate : copy.failBody}</p>
          <div className="jl-form-fail-actions">
            {waFail && (
              <a href={waFail} target="_blank" rel="noopener noreferrer">
                {copy.failWhatsapp}
              </a>
            )}
            <a href={mail}>{copy.failEmail}</a>
          </div>
        </div>
      )}
    </div>
  )
}
