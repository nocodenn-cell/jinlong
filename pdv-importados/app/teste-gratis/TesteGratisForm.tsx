'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/lib/navigation/routes'
import { tc, type ChaveTexto } from '@/lib/cobranca/textos'
import { iniciarTesteGratisAction } from './actions'

export function TesteGratisForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [idioma, setIdioma] = useState<'pt' | 'zh'>('pt')
  const t = (k: ChaveTexto) => tc(idioma, k)
  const [pend, start] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<string | null>(null)

  if (enviado) return <p role="status" className="rounded border bg-green-50 p-4 text-sm">{t('verifiqueEmail')} ({enviado})</p>

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setErro(null)
        start(async () => {
          const r = await iniciarTesteGratisAction({
            empresaNome: String(fd.get('empresa') ?? ''), donoNome: String(fd.get('nome') ?? ''),
            email: String(fd.get('email') ?? ''), senha: String(fd.get('senha') ?? ''),
            telefone: String(fd.get('telefone') ?? '') || undefined,
            plano: (String(fd.get('plano') ?? 'ATACADO') as 'ATACADO'), idioma,
            aceiteTermos: fd.get('aceite') === 'on' ? true : (false as unknown as true),
            site: String(fd.get('site') ?? ''),
            captchaToken: String(fd.get('cf-turnstile-response') ?? '') || undefined,
          })
          if (r.ok) setEnviado(r.email); else setErro(r.error)
        })
      }}
    >
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" onClick={() => setIdioma('pt')} aria-pressed={idioma === 'pt'}>PT</button>
        <button type="button" onClick={() => setIdioma('zh')} aria-pressed={idioma === 'zh'}>中文</button>
      </div>
      <h1 className="text-xl font-semibold">{t('trialTitulo')}</h1>
      <p className="text-sm text-gray-600">{t('trialSub')}</p>
      {erro ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{erro}</p> : null}
      {(['empresa', 'nome', 'email', 'senha', 'telefone'] as const).map((n) => (
        <label key={n} className="block text-sm">{t(n)}
          <input name={n} required={n !== 'telefone'} type={n === 'senha' ? 'password' : n === 'email' ? 'email' : 'text'}
            minLength={n === 'senha' ? 8 : undefined} className="mt-1 w-full rounded border p-2" autoComplete={n === 'senha' ? 'new-password' : undefined} />
        </label>
      ))}
      <label className="block text-sm">{t('plano')}
        <select name="plano" defaultValue="ATACADO" className="mt-1 w-full rounded border p-2">
          <option value="BASICO">Básico</option><option value="ATACADO">Atacado</option><option value="REDE">Rede</option>
        </select>
      </label>
      {/* honeypot anti-robô: invisível para pessoas */}
      <input name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {turnstileSiteKey ? <div className="cf-turnstile" data-sitekey={turnstileSiteKey} /> : null}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="aceite" required />
        <span>{t('aceite')} (<Link className="underline" href={ROUTES.legal.termos}>termos</Link> · <Link className="underline" href={ROUTES.legal.privacidade}>privacidade</Link>)</span>
      </label>
      <button type="submit" disabled={pend} className="w-full rounded bg-red-700 p-3 font-medium text-white disabled:opacity-50">{t('criar')}</button>
      <p className="text-center text-sm"><Link href={ROUTES.auth.login} className="underline">Login</Link></p>
    </form>
  )
}
