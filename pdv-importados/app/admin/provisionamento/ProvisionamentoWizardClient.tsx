'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
import {
  gerarCodigoAtivacaoPdvAction,
  provisionarEmpresaAction,
  type ProvisionamentoEmpresaResult,
} from './actions'

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
  stepEquipe: string
  fieldEmpresaNome: string
  fieldEmpresaCnpj: string
  lojasExtrasTitulo: string
  btnAddLoja: string
  btnRemover: string
  equipeTitulo: string
  equipeHint: string
  btnAddPessoa: string
  papelGerente: string
  papelOperador: string
  fieldPessoaNome: string
  fieldPessoaEmail: string
  fieldPessoaSenha: string
  fieldPessoaLojas: string
  okEmpresa: string
  okEquipe: string
  ativacaoTitulo: string
  ativacaoHint: string
  btnGerarCodigo: string
  codigoValidoAte: string
}

type Membro = {
  nome: string
  email: string
  senha: string
  papel: 'GERENTE' | 'OPERADOR'
  lojas: number[]
}

type Props = {
  labels: ProvisionamentoLabels
}

type Step = 0 | 1 | 2 | 3 | 4

export function ProvisionamentoWizardClient({ labels: L }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProvisionamentoEmpresaResult | null>(null)
  const [empresaNome, setEmpresaNome] = useState('')
  const [empresaCnpj, setEmpresaCnpj] = useState('')
  const [lojasExtras, setLojasExtras] = useState<string[]>([])
  const [equipe, setEquipe] = useState<Membro[]>([])
  const [codigos, setCodigos] = useState<Record<string, { codigo: string; expiraEm: string }>>({})

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
    setEmpresaNome('')
    setEmpresaCnpj('')
    setLojasExtras([])
    setEquipe([])
    setCodigos({})
  }

  const nomesLojas = [lojaNome, ...lojasExtras].map((n) => n.trim())
  const equipeValida = equipe.every(
    (m) =>
      m.nome.trim().length >= 2 &&
      m.email.includes('@') &&
      m.senha.length >= PASSWORD_MIN_LENGTH &&
      m.lojas.length >= 1 &&
      (m.papel === 'GERENTE' || m.lojas.length === 1),
  )

  function updMembro(i: number, patch: Partial<Membro>) {
    setEquipe((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  }

  function toggleLojaMembro(i: number, loja: number) {
    const m = equipe[i]
    if (m.papel === 'OPERADOR') return updMembro(i, { lojas: [loja] })
    updMembro(i, { lojas: m.lojas.includes(loja) ? m.lojas.filter((x) => x !== loja) : [...m.lojas, loja].sort() })
  }

  async function onGerarCodigo(lojaId: string) {
    const r = await gerarCodigoAtivacaoPdvAction(lojaId)
    if (!r.ok) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setCodigos((prev) => ({ ...prev, [lojaId]: r.data }))
  }

  async function onProvisionar() {
    setBusy(true)
    try {
      const r = await provisionarEmpresaAction({
        empresaNome: empresaNome.trim() || lojaNome,
        empresaCnpj: empresaCnpj.trim() || null,
        lojas: [
          { nome: lojaNome, codigo: lojaCodigo.trim() || null },
          ...lojasExtras.filter((n) => n.trim()).map((nome) => ({ nome, codigo: null })),
        ],
        dono: { nome: donoNome, email: donoEmail, senha: donoSenha },
        equipe,
        idiomaPreferido: idioma,
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setResult(r.data)
      setStep(4)
      emitGerenteToast({ kind: 'success', message: L.okLoja })
    } finally {
      setBusy(false)
    }
  }

  const steps = [L.stepLoja, L.stepDono, L.stepEquipe, L.stepConfirmar, L.stepResultado]

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
            <span className="font-medium">{L.fieldEmpresaNome}</span>
            <input
              data-testid="prov-empresa-nome"
              value={empresaNome}
              onChange={(e) => setEmpresaNome(e.target.value)}
              className="fp-control w-full text-small"
              placeholder={lojaNome}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L.fieldEmpresaCnpj}</span>
            <input
              data-testid="prov-empresa-cnpj"
              value={empresaCnpj}
              onChange={(e) => setEmpresaCnpj(e.target.value)}
              className="fp-control w-full text-small"
              inputMode="numeric"
              placeholder="OPCIONAL"
            />
          </label>
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
          <div className="space-y-2 text-sm">
            <span className="font-medium">{L.lojasExtrasTitulo}</span>
            {lojasExtras.map((nome, i) => (
              <div key={i} className="flex gap-2">
                <input
                  data-testid={`prov-loja-extra-${i}`}
                  value={nome}
                  onChange={(e) => setLojasExtras((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  className="fp-control w-full text-small"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLojasExtras((p) => p.filter((_, j) => j !== i))
                    setEquipe((p) =>
                      p.map((m) => ({
                        ...m,
                        lojas: m.lojas.filter((x) => x !== i + 1).map((x) => (x > i + 1 ? x - 1 : x)),
                      })),
                    )
                  }}
                >
                  {L.btnRemover}
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setLojasExtras((p) => [...p, ''])}>
              {L.btnAddLoja}
            </Button>
          </div>
          <Button
            type="button"
            data-testid="prov-step-loja-next"
            disabled={lojaNome.trim().length < 2 || lojasExtras.some((n) => n.trim().length < 2)}
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
          <h2 className="text-sm font-semibold">{L.equipeTitulo}</h2>
          <p className="text-xs text-jl-fg-3">{L.equipeHint}</p>
          {equipe.map((m, i) => (
            <div key={i} className="space-y-2 rounded-md border border-jl-border-1 p-3 text-sm" data-testid={`prov-membro-${i}`}>
              <div className="flex gap-2">
                <select
                  value={m.papel}
                  onChange={(e) => {
                    const papel = e.target.value as Membro['papel']
                    updMembro(i, { papel, lojas: papel === 'OPERADOR' ? m.lojas.slice(0, 1) : m.lojas })
                  }}
                  className="fp-control text-small"
                >
                  <option value="OPERADOR">{L.papelOperador}</option>
                  <option value="GERENTE">{L.papelGerente}</option>
                </select>
                <Button type="button" variant="outline" onClick={() => setEquipe((p) => p.filter((_, j) => j !== i))}>
                  {L.btnRemover}
                </Button>
              </div>
              <input placeholder={L.fieldPessoaNome} value={m.nome} onChange={(e) => updMembro(i, { nome: e.target.value })} className="fp-control w-full text-small" />
              <input placeholder={L.fieldPessoaEmail} type="email" value={m.email} onChange={(e) => updMembro(i, { email: e.target.value })} className="fp-control w-full text-small" />
              <input placeholder={L.fieldPessoaSenha} type="password" autoComplete="new-password" value={m.senha} onChange={(e) => updMembro(i, { senha: e.target.value })} className="fp-control w-full text-small" />
              <div className="flex flex-wrap gap-3">
                <span className="text-xs text-jl-fg-3">{L.fieldPessoaLojas}:</span>
                {nomesLojas.map((nome, li) => (
                  <label key={li} className="flex items-center gap-1 text-xs">
                    <input
                      type={m.papel === 'OPERADOR' ? 'radio' : 'checkbox'}
                      checked={m.lojas.includes(li)}
                      onChange={() => toggleLojaMembro(i, li)}
                    />
                    {nome}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            data-testid="prov-add-membro"
            onClick={() => setEquipe((p) => [...p, { nome: '', email: '', senha: '', papel: 'OPERADOR', lojas: [0] }])}
          >
            {L.btnAddPessoa}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              {L.btnVoltar}
            </Button>
            <Button type="button" data-testid="prov-step-equipe-next" disabled={!equipeValida} onClick={() => setStep(3)}>
              {L.btnProximo}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 rounded-xl border border-jl-border-1 p-4">
          <h2 className="text-sm font-semibold">{L.resumoTitulo}</h2>
          <ul className="space-y-1 text-sm text-jl-fg-2">
            <li>
              <strong>{L.fieldEmpresaNome}:</strong> {empresaNome.trim() || lojaNome}
            </li>
            <li>
              <strong>{L.fieldLojaNome}:</strong> {nomesLojas.filter(Boolean).join(', ')}
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
            <li>
              <strong>{L.equipeTitulo}:</strong>{' '}
              {equipe.length === 0
                ? '—'
                : equipe.map((m) => `${m.nome} (${m.papel === 'GERENTE' ? L.papelGerente : L.papelOperador})`).join(', ')}
            </li>
          </ul>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(2)}>
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

      {step === 4 && result ? (
        <div className="space-y-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <ul className="space-y-2 text-sm">
            <li>
              {L.okEmpresa}:{' '}
              <code data-testid="prov-empresa-id" className="text-xs">
                {result.empresaId}
              </code>
            </li>
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
            {result.equipe.length > 0 ? (
              <li>
                {L.okEquipe}: {result.equipe.map((m) => m.email).join(', ')}
              </li>
            ) : null}
            <li>{L.okConfig}</li>
            <li>
              {L.okChecklist}: {result.itensMarcados.join(', ')}
            </li>
          </ul>
          <div className="space-y-2 rounded-md border border-jl-border-1 p-3 text-sm">
            <h3 className="font-semibold">{L.ativacaoTitulo}</h3>
            <p className="text-xs text-jl-fg-3">{L.ativacaoHint}</p>
            {result.lojas.map((loja) => (
              <div key={loja.id} className="flex flex-wrap items-center gap-2">
                <span>{loja.nome}</span>
                {codigos[loja.id] ? (
                  <span>
                    <code data-testid={`prov-codigo-${loja.id}`} className="text-base font-bold tracking-widest">
                      {codigos[loja.id].codigo}
                    </code>{' '}
                    <span className="text-xs text-jl-fg-3">
                      {L.codigoValidoAte} {new Date(codigos[loja.id].expiraEm).toLocaleString()}
                    </span>
                  </span>
                ) : (
                  <Button type="button" variant="outline" onClick={() => void onGerarCodigo(loja.id)}>
                    {L.btnGerarCodigo}
                  </Button>
                )}
              </div>
            ))}
          </div>
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
