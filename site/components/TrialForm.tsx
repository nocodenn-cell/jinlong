'use client'

import { useState, type FormEvent } from 'react'
import type { TrialFormCopy } from '@/lib/content/types'

interface TrialFormProps {
  copy: TrialFormCopy
  email: string
  whatsappHref: string | null
}

type Field = 'name' | 'store' | 'city' | 'wechat' | 'whatsapp'

/**
 * Agendamento de demonstração (sem teste automático). Não há backend: o envio monta a mensagem e abre o e-mail (mailto) ou o
 * WhatsApp do visitante com o texto pronto. Nenhum dado sai do navegador sem ação do visitante.
 * [CONFIRMAR: destino do formulário] — trocar por um endpoint quando houver.
 */
export function TrialForm({ copy, email, whatsappHref }: TrialFormProps) {
  const [via, setVia] = useState<'email' | 'whatsapp'>('email')
  const fields: ReadonlyArray<{ id: Field; label: string; required: boolean; type: string; auto: string }> = [
    { id: 'name', label: copy.name, required: true, type: 'text', auto: 'name' },
    { id: 'store', label: copy.store, required: true, type: 'text', auto: 'organization' },
    { id: 'city', label: copy.city, required: true, type: 'text', auto: 'address-level2' },
    { id: 'wechat', label: copy.wechat, required: false, type: 'text', auto: 'off' },
    { id: 'whatsapp', label: copy.whatsapp, required: false, type: 'tel', auto: 'tel' },
  ]

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const lines = [
      ...fields.map((f) => `${f.label}: ${String(data.get(f.id) ?? '').trim()}`),
      `${copy.type}: ${String(data.get('type') ?? '')}`,
      `${copy.preferred}: ${String(data.get('preferred') ?? '')}`,
    ]
    const text = `${copy.mailSubject}\n\n${lines.join('\n')}`
    if (via === 'whatsapp' && whatsappHref) {
      const url = new URL(whatsappHref)
      url.searchParams.set('text', text)
      window.open(url.toString(), '_blank', 'noopener')
      return
    }
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(copy.mailSubject)}&body=${encodeURIComponent(lines.join('\n'))}`
  }

  return (
    <form className="jl-form" onSubmit={onSubmit} aria-labelledby="h-form">
      <h3 id="h-form">{copy.title}</h3>
      <p className="jl-form-lead">{copy.lead}</p>
      <div className="jl-form-grid">
        {fields.map((f) => (
          <label key={f.id}>
            <span>{f.label}</span>
            <input name={f.id} type={f.type} required={f.required} autoComplete={f.auto} />
          </label>
        ))}
        <fieldset>
          <legend>{copy.type}</legend>
          {[copy.typeRetail, copy.typeWholesale, copy.typeBoth].map((option, index) => (
            <label key={option} className="jl-radio">
              <input type="radio" name="type" value={option} defaultChecked={index === 2} />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{copy.preferred}</legend>
          {[copy.prefEmail, copy.prefWhatsapp, copy.prefWechat, copy.prefPhone].map((option, index) => (
            <label key={option} className="jl-radio">
              <input type="radio" name="preferred" value={option} defaultChecked={index === 0} />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="jl-form-actions">
        <button type="submit" className="jl-btn jl-btn--primary" onClick={() => setVia('email')}>
          {copy.sendEmail}
        </button>
        {whatsappHref && (
          <button type="submit" className="jl-btn jl-btn--secondary" onClick={() => setVia('whatsapp')}>
            {copy.sendWhatsapp}
          </button>
        )}
      </div>
      <p className="jl-form-note">{copy.note}</p>
    </form>
  )
}
