'use client'

import { useRef, useState, type FormEvent } from 'react'
import { leadExtrasSchema, readUtms } from '@/lib/leadSchema'
import { trackLead } from '@/lib/track'
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
 * Agendamento de demonstração: POST /pedido-demo registra o pedido e devolve um protocolo.
 * Se o registro falhar (sem configuração, indisponível, limite), mostra e-mail/WhatsApp com o texto pronto —
 * o pedido nunca se perde em silêncio.
 */
export function TrialForm({ copy, email, whatsappHref, locale }: TrialFormProps) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const channel: DemoChannel = 'whatsapp'
  const [errors, setErrors] = useState<DemoFieldError[]>([])
  const [values, setValues] = useState({ name: '', store: '', contact: '', city: '', segment: '', wechat: '', idioma: locale as string })
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
    const extras = leadExtrasSchema.safeParse({ city: v.city, segment: v.segment, wechat: v.wechat, idioma: v.idioma })
    if (!extras.success) for (const i of extras.error.issues) {
      const f = i.path[0] as DemoFieldError
      if (!out.includes(f)) out.push(f)
    }
    return out
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const g = (k: string) => String(data.get(k) ?? '')
    const v = { name: g('name'), store: g('store'), contact: g('contact'), city: g('city'), segment: g('segment'), wechat: g('wechat'), idioma: g('idioma') || locale }
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
      const res = await fetch('/pedido-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, channel, locale, ...readUtms(window.location.search), website: g('website') }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; protocol?: string; error?: string; fields?: DemoFieldError[] } | null
      if (res.ok && body?.ok && body.protocol) {
        trackLead()
        setState({ kind: 'ok', protocol: body.protocol })
        const target = v.idioma === 'zh-CN' ? 'zh-CN' : 'pt-BR'
        window.location.assign(`/${target}/obrigado?p=${encodeURIComponent(body.protocol)}`)
        return
      } else if (res.status === 400 && body?.fields?.length) {
        setErrors(body.fields)
        setState({ kind: 'idle' })
        return
      } else {
        console.error(`[Jinlong lead] envio falhou: HTTP ${res.status} (${body?.error ?? 'sem detalhe'})`)
        setState({ kind: 'fail', rate: res.status === 429 })
      }
    } catch (err) {
      console.error('[Jinlong lead] erro de rede ao enviar:', err instanceof Error ? err.message : err)
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
    city: copy.errCity,
    segment: copy.errSegment,
    wechat: copy.errContactWechat,
    idioma: copy.errCity,
  }
  const field = (id: 'name' | 'store' | 'contact' | 'city' | 'segment' | 'wechat', label: string, type: string, auto: string, hint?: string) => {
    const invalid = errors.includes(id)
    const describedBy = [hint ? `${id}-hint` : '', invalid ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
    return (
      <label key={id} className={id === 'contact' ? 'jl-span' : undefined}>
        <span>{label}</span>
        <input
          name={id}
          type={type}
          required={id !== 'wechat'}
          minLength={id === 'contact' || id === 'wechat' ? 3 : 2}
          maxLength={id === 'contact' ? 60 : id === 'wechat' ? 40 : id === 'store' ? 120 : 80}
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
        {field('contact', copy.contact, channel === 'whatsapp' ? 'tel' : 'text', channel === 'whatsapp' ? 'tel' : 'off',
          copy.contactHintWhatsapp)}
        {field('wechat', copy.wechatOptional, 'text', 'off', copy.contactHintWechat)}
        {field('city', copy.city, 'text', 'address-level2')}
        {field('segment', copy.segment, 'text', 'off')}
        <label>
          <span>{copy.idioma}</span>
          <select name="idioma" defaultValue={values.idioma}>
            <option value="pt-BR">Português</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </label>
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
      <p className="jl-muted"><small>{locale === 'zh-CN' ? '您的信息仅用于联系演示事宜。我们可能使用统计 Cookie（Google/Meta）改进广告。' : 'Usamos seus dados só para contato sobre a demonstração. Podemos usar cookies de medição (Google/Meta) para melhorar nossos anúncios.'}</small></p>
    </form>
  )
}
