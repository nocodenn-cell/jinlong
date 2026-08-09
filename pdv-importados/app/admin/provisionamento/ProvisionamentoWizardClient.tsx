'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
import { provisionarLojaAction, type ProvisionamentoResult } from './actions'

export type ProvisionamentoLabels = {
  stepLoja: string
  stepDono: string
  stepConfirmar: string
  stepResultado: string
  fieldLojaNome: string
  fieldLojaCodigo: string
  fieldLojaCodigoHint: string
  fieldDonoNome: string
  fieldDonoEmail: string
  fieldDonoSenha: string
  fieldIdioma: string
  idiomaPt: string
  idiomaZh: string
  senhaHint: string
  btnProximo: string
  btnVoltar: string
  btnProvisionar: string
  btnProvisionando: string
  btnNovo: string
  avisoInterno: string
  avisoNfce: string
  resumoTitulo: string
  okLoja: string
  okDono: string
  okConfig: string
  okChecklist: string
  linkImplantacao: string
  reutilizado: string
  criado: string
}

type Props = {
  labels: ProvisionamentoLabels
}

type Step = 0 | 1 | 2 | 3

export function ProvisionamentoWizardClient({ labels: L }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProvisionamentoResult | null>(null)

  const [lojaNome, setLojaNome] = useState('')
  const [lojaCodigo, setLojaCodigo] = useState('')
  const [donoNome, setDonoNome] = useState('')
  const [donoEmail, setDonoEmail] = useState('')
  const [donoSenha, setDonoSenha] = useState('')
  const [idioma, setIdioma] = useState<'pt' | 'zh'>('zh')

  function resetForm() {
    setStep(0)
    setResult(null)
    setLojaNome('')
    setLojaCodigo('')
    setDonoNome('')
    setDonoEmail('')
    setDonoSenha('')
    setIdioma('zh')
  }

  async function onProvisionar() {
    setBusy(true)
    try {
      const r = await provisionarLojaAction({
        lojaNome,
        lojaCodigo: lojaCodigo.trim() || null,
        donoNome,
        donoEmail,
        donoSenha,
        idiomaPreferido: idioma,
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setResult(r.data)
      setStep(3)
      emitGerenteToast({ kind: 'success', message: L.okLoja })
    } finally {
      setBusy(false)
    }
  }

  const steps = [L.stepLoja, L.stepDono, L.stepConfirmar, L.stepResultado]

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="rounded-md border border-jl-border-1 bg-jl-surface-soft px-3 py-2 text-sm text-jl-fg-2">
        {L.avisoInterno}
      </p>
      <p className="text-xs text-jl-fg-3">{L.avisoNfce}</p>

      <ol className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide">
        {steps.map((label, i) => (
          <li
            key={label}
            className={
              i === step
                ? 'rounded-full bg-[rgba(251,191,36,0.15)] px-3 py-1 text-[var(--color-brand-primary)]'
                : 'rounded-full px-3 py-1 text-jl-fg-3'
            }
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-4 rounded-xl border border-jl-border-1 p-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L.fieldLojaNome}</span>
            <input
              data-testid="prov-loja-nome"
              value={lojaNome}
              onChange={(e) => setLojaNome(e.target.value)}
              className="fp-control w-full text-small"
              autoComplete="organization"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L.fieldLojaCodigo}</span>
            <input
              data-testid="prov-loja-codigo"
              value={lojaCodigo}
              onChange={(e) => setLojaCodigo(e.target.value)}
              className="fp-control w-full text-small"
              placeholder="OPCIONAL"
            />
            <span className="text-xs text-jl-fg-3">{L.fieldLojaCodigoHint}</span>
          </label>
          <Button
            type="button"
            data-testid="prov-step-loja-next"
            disabled={lojaNome.trim().length < 2}
            onClick={() => setStep(1)}
          >
            {L.btnProximo}
          </Button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4 rounded-xl border border-jl-border-1 p-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L.fieldDonoNome}</span>
            <input
              data-testid="prov-dono-nome"
              value={donoNome}
              onChange={(e) => setDonoNome(e.target.value)}
              className="fp-control w-full text-small"
              autoComplete="name"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L.fieldDonoEmail}</span>
            <input
              data-testid="prov-dono-email"
              type="email"
              value={donoEmail}
              onChange={(e) => setDonoEmail(e.target.value)}
              className="fp-control w-full text-small"
              autoComplete="email"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L.fieldDonoSenha}</span>
            <input
              data-testid="prov-dono-senha"
              type="password"
              value={donoSenha}
              onChange={(e) => setDonoSenha(e.target.value)}
              className="fp-control w-full text-small"
              autoComplete="new-password"
            />
            <span className="text-xs text-jl-fg-3">
              {L.senhaHint.replace('{n}', String(PASSWORD_MIN_LENGTH))}
            </span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L.fieldIdioma}</span>
            <select
              data-testid="prov-dono-idioma"
              value={idioma}
              onChange={(e) => setIdioma(e.target.value as 'pt' | 'zh')}
              className="fp-control w-full text-small"
            >
              <option value="zh">{L.idiomaZh}</option>
              <option value="pt">{L.idiomaPt}</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              {L.btnVoltar}
            </Button>
            <Button
              type="button"
              data-testid="prov-step-dono-next"
              disabled={
                donoNome.trim().length < 2 ||
                !donoEmail.includes('@') ||
                donoSenha.length < PASSWORD_MIN_LENGTH
              }
              onClick={() => setStep(2)}
            >
              {L.btnProximo}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 rounded-xl border border-jl-border-1 p-4">
          <h2 className="text-sm font-semibold">{L.resumoTitulo}</h2>
          <ul className="space-y-1 text-sm text-jl-fg-2">
            <li>
              <strong>{L.fieldLojaNome}:</strong> {lojaNome}
            </li>
            <li>
              <strong>{L.fieldLojaCodigo}:</strong> {lojaCodigo.trim() || '—'}
            </li>
            <li>
              <strong>{L.fieldDonoNome}:</strong> {donoNome}
            </li>
            <li>
              <strong>{L.fieldDonoEmail}:</strong> {donoEmail}
            </li>
            <li>
              <strong>{L.fieldIdioma}:</strong> {idioma === 'zh' ? L.idiomaZh : L.idiomaPt}
            </li>
          </ul>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(1)}>
              {L.btnVoltar}
            </Button>
            <Button
              type="button"
              data-testid="prov-submit"
              disabled={busy}
              onClick={() => void onProvisionar()}
            >
              {busy ? L.btnProvisionando : L.btnProvisionar}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="space-y-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <ul className="space-y-2 text-sm">
            <li>
              {L.okLoja}:{' '}
              <code data-testid="prov-loja-id" className="text-xs">
                {result.lojaId}
              </code>{' '}
              (
              {result.lojaNova ? L.criado : L.reutilizado}) — {result.lojaNome}
            </li>
            <li>
              {L.okDono}: {result.donoEmail} ({result.donoNovo ? L.criado : L.reutilizado})
            </li>
            <li>{L.okConfig}</li>
            <li>
              {L.okChecklist}: {result.itensMarcados.join(', ')}
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={result.implantacaoHref}>{L.linkImplantacao}</Link>
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              {L.btnNovo}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
