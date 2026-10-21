'use client'

import { useRef, useState, type FormEvent } from 'react'
import type { TrialFormCopy } from '@/lib/content/types'
import { isValidContact, type DemoChannel, type DemoFieldError, type DemoLocale } from '@/lib/demoRequest'

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

/**
 * Agendamento de demonstração: POST /api/demo registra o pedido e devolve um protocolo.
 * Se o registro falhar (sem configuração, indisponível, limite), mostra e-mail/WhatsApp com o texto pronto —
 * o pedido nunca se perde em silêncio.
 */
export function TrialForm({ copy, email, whatsappHref, locale }: TrialFormProps) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [channel, setChannel] = useState<DemoChannel>('whatsapp')
  const [errors, setErrors] = useState<DemoFieldError[]>([])
  const [values, setValues] = useState({ name: '', store: '', contact: '' })
  const statusRef = useRef<HTMLDivElement>(null)

  const summary = `${copy.mailSubject}\n\n${copy.name}: ${values.name}\n${copy.store}: ${values.store}\n${copy.contact} (${channel === 'whatsapp' ? copy.channelWhatsapp : copy.channelWechat}): ${values.contact}`
  const waLink = (text: string) => {
    if (!whatsappHref) return null
    const url = new URL(whatsappHref)
    url.searchParams.set('text', text)
    return url.toString()
  }
  const focusStatus = () => requestAnimationFrame(() => statusRef.current?.focus())

  function localErrors(v: typeof values): DemoFieldError[] {
    const out: DemoFieldError[] = []
    if (v.name.trim().length < 2) out.push('name')
    if (v.store.trim().length < 2) out.push('store')
    if (!isValidContact(v.contact.trim(), channel)) out.push('contact')
    return out
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const v = { name: String(data.get('name') ?? ''), store: String(data.get('store') ?? ''), contact: String(data.get('contact') ?? '') }
    setValues(v)
    const local = localErrors(v)
    setErrors(local)
    if (local.length) {
      const first = event.currentTarget.querySelector<HTMLInputElement>(`[name="${local[0]}"]`)
      first?.focus()
      return
    }
    setState({ kind: 'sending' })
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, channel, locale, website: String(data.get('website') ?? '') }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; protocol?: string; error?: string; fields?: DemoFieldError[] } | null
      if (res.ok && body?.ok && body.protocol) {
        setState({ kind: 'ok', protocol: body.protocol })
      } else if (res.status === 400 && body?.fields?.length) {
        setErrors(body.fields)
        setState({ kind: 'idle' })
        return
      } else {
        setState({ kind: 'fail', rate: res.status === 429 })
      }
    } catch {
      setState({ kind: 'fail', rate: false })
    }
    focusStatus()
  }

  if (state.kind === 'ok') {
    const wa = channel === 'whatsapp' ? waLink(`${copy.mailSubject} — ${copy.okProtocol}: ${state.protocol}`) : null
    return (
      <div className="jl-form jl-form-done" role="status" aria-labelledby="h-form" tabIndex={-1} ref={statusRef}>
        <h3 id="h-form">{copy.okTitle}</h3>
        <p>{copy.okBody}</p>
        <p className="jl-protocol">
          {copy.okProtocol}: <strong data-testid="protocol">{state.protocol}</strong>
        </p>
        <p>{copy.okKeep}</p>
        {wa && (
          <div className="jl-form-actions">
            <a className="jl-btn jl-btn--primary" href={wa} target="_blank" rel="noopener noreferrer">
              {copy.okWhatsapp}
            </a>
          </div>
        )}
      </div>
    )
  }

  const errText: Record<DemoFieldError, string> = {
    name: copy.errName,
    store: copy.errStore,
    contact: channel === 'whatsapp' ? copy.errContactWhatsapp : copy.errContactWechat,
    channel: copy.errContactWechat,
  }
  const field = (id: 'name' | 'store' | 'contact', label: string, type: string, auto: string, hint?: string) => {
    const invalid = errors.includes(id)
    const describedBy = [hint ? `${id}-hint` : '', invalid ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
    return (
      <label key={id} className={id === 'contact' ? 'jl-span' : undefined}>
        <span>{label}</span>
        <input
          name={id}
          type={type}
          required
          minLength={id === 'contact' ? 3 : 2}
          maxLength={id === 'contact' ? 60 : id === 'name' ? 80 : 120}
          autoComplete={auto}
          inputMode={id === 'contact' && channel === 'whatsapp' ? 'tel' : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={values[id]}
        />
        {hint && <small id={`${id}-hint`} className="jl-hint">{hint}</small>}
        {invalid && <small id={`${id}-err`} className="jl-err">{errText[id]}</small>}
      </label>
    )
  }
  const mail = `mailto:${email}?subject=${encodeURIComponent(copy.mailSubject)}&body=${encodeURIComponent(summary)}`
  const waFail = waLink(summary)

  return (
    <form className="jl-form" onSubmit={onSubmit} aria-labelledby="h-form" noValidate>
      <h3 id="h-form">{copy.title}</h3>
      <p className="jl-form-lead">{copy.lead}</p>
      <div className="jl-form-grid">
        {field('name', copy.name, 'text', 'name')}
        {field('store', copy.store, 'text', 'organization')}
        <fieldset className="jl-span">
          <legend>{copy.channel}</legend>
          {(['whatsapp', 'wechat'] as const).map((c) => (
            <label key={c} className="jl-radio">
              <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} />
              <span>{c === 'whatsapp' ? copy.channelWhatsapp : copy.channelWechat}</span>
            </label>
          ))}
        </fieldset>
        {field('contact', copy.contact, channel === 'whatsapp' ? 'tel' : 'text', channel === 'whatsapp' ? 'tel' : 'off',
          channel === 'whatsapp' ? copy.contactHintWhatsapp : copy.contactHintWechat)}
        <div className="jl-hp" aria-hidden="true">
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </div>
      <div className="jl-form-actions">
        <button type="submit" className="jl-btn jl-btn--primary" disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? copy.sending : copy.submit}
        </button>
      </div>
      <p className="jl-form-note">{copy.note}</p>
      {state.kind === 'fail' && (
        <div className="jl-form-fail" role="alert" tabIndex={-1} ref={statusRef}>
          <p><strong>{copy.failTitle}</strong></p>
          <p>{state.rate ? copy.errRate : copy.failBody}</p>
          <div className="jl-form-actions">
            {waFail && (
              <a className="jl-btn jl-btn--primary" href={waFail} target="_blank" rel="noopener noreferrer">
                {copy.failWhatsapp}
              </a>
            )}
            <a className="jl-btn jl-btn--secondary" href={mail}>
              {copy.failEmail}
            </a>
          </div>
        </div>
      )}
    </form>
  )
}
